import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { NotificationKind } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaService } from 'src/infra/prisma/prisma.service';

/**
 * The one field of an uploaded file this code trusts: the bytes.
 *
 * Typed here rather than through `Express.Multer.File` so the module does not
 * need the global type package, and so it is obvious that the client's
 * `mimetype` and `originalname` are read by nothing below.
 */
export interface UploadedImage {
  buffer: Buffer;
  size: number;
}

export const AVATAR_DIR = join(process.cwd(), 'uploads', 'avatars');
export const AVATAR_URL_PREFIX = '/uploads/avatars';

const MAX_BYTES = 2 * 1024 * 1024;

/**
 * What the bytes actually are, and the extension we will give them.
 *
 * SVG is deliberately absent. It is a document, not a picture: it can carry
 * script, and serving one from our own origin would hand an attacker a stored
 * XSS on every page that shows the avatar.
 */
const SIGNATURES: { ext: string; matches: (b: Buffer) => boolean }[] = [
  {
    ext: 'png',
    matches: (b) => b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  },
  {
    ext: 'jpg',
    matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    ext: 'webp',
    matches: (b) =>
      b.subarray(0, 4).toString('ascii') === 'RIFF' &&
      b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
];

@Injectable()
export class AvatarService {
  private readonly logger = new Logger(AvatarService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Stores a new profile picture and points the account at it.
   *
   * The file is identified by its own first bytes rather than by the content
   * type the browser announced, and it is written under a name this server
   * generates — a filename that came from the client is a path traversal
   * waiting to be tried.
   */
  async replace(userId: string, file: UploadedImage | undefined): Promise<{ avatarUrl: string }> {
    if (!file) throw new BadRequestException('No file was sent');
    if (file.size > MAX_BYTES) throw new BadRequestException('That image is larger than 2 MB');

    const kind = SIGNATURES.find((signature) => signature.matches(file.buffer));
    if (!kind) throw new BadRequestException('Only PNG, JPEG and WebP images are accepted');

    const name = `${randomUUID()}.${kind.ext}`;
    await mkdir(AVATAR_DIR, { recursive: true });
    await writeFile(join(AVATAR_DIR, name), file.buffer);

    const avatarUrl = `${AVATAR_URL_PREFIX}/${name}`;

    const previous = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: { avatarUrl: true },
    });

    await this.prisma.userProfile.upsert({
      where: { userId },
      update: { avatarUrl },
      create: { userId, avatarUrl },
    });

    await this.prisma.notification.create({
      data: { userId, kind: NotificationKind.PROFILE_UPDATED, metadata: {} },
    });

    await this.discard(previous?.avatarUrl ?? null);

    return { avatarUrl };
  }

  /** Drops the picture and leaves the account showing the placeholder again. */
  async remove(userId: string): Promise<void> {
    const previous = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: { avatarUrl: true },
    });

    await this.prisma.userProfile.updateMany({ where: { userId }, data: { avatarUrl: null } });
    await this.discard(previous?.avatarUrl ?? null);
  }

  /**
   * Drops the stored file for an account without touching any row.
   *
   * For the account that is about to be deleted: the profile row naming the
   * file cascades away with the user, and a file nothing points at is one
   * nobody can ever clean up.
   */
  async forget(userId: string): Promise<void> {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: { avatarUrl: true },
    });

    await this.discard(profile?.avatarUrl ?? null);
  }
  /**
   * Deletes a file this server wrote, and only that.
   *
   * The seeded accounts point at pictures hosted elsewhere, and a URL that did
   * not come from here names nothing on this disk — the prefix check is what
   * keeps a stored value from steering `unlink` somewhere it should not go.
   * A failure is logged rather than thrown: the new avatar is already saved,
   * and an orphaned old file is not worth failing the request over.
   */
  private async discard(url: string | null): Promise<void> {
    if (!url?.startsWith(`${AVATAR_URL_PREFIX}/`)) return;

    const name = url.slice(AVATAR_URL_PREFIX.length + 1);
    if (!/^[a-f0-9-]+\.(png|jpg|webp)$/.test(name)) return;

    try {
      await unlink(join(AVATAR_DIR, name));
    } catch (error) {
      this.logger.warn(`Could not remove the old avatar: ${(error as Error).message}`);
    }
  }
}
