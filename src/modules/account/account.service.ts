import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuditAction, NotificationKind, Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import type { RequestUser } from 'src/common/types/request-user';
import { verifyPassword } from 'src/common/utils/crypto.util';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SessionService } from '../auth/session.service';
import { ROLES } from '../rbac/rbac.constants';
import { AvatarService } from './avatar.service';
import { DeleteAccountDto, UpdateProfileDto } from './dto/account.dto';

export interface ProfileView {
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  avatarUrl: string | null;
  addressLine: string | null;
}

export interface NotificationView {
  id: string;
  kind: NotificationKind;
  metadata: Record<string, unknown>;
  read: boolean;
  createdAt: Date;
}

@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly avatars: AvatarService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  async profile(userId: string): Promise<ProfileView> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, profile: true },
    });

    if (!user) throw new NotFoundException('No such account');

    return {
      email: user.email,
      firstName: user.profile?.firstName ?? null,
      lastName: user.profile?.lastName ?? null,
      phone: user.profile?.phone ?? null,
      avatarUrl: user.profile?.avatarUrl ?? null,
      addressLine: user.profile?.addressLine ?? null,
    };
  }

  /**
   * Applies a partial edit.
   *
   * Only the keys that arrived are written, so a screen that edits the phone
   * number cannot blank the name by not knowing about it. An upsert covers the
   * account whose profile row never existed — registration creates one, but an
   * account that predates that column would otherwise fail here.
   */
  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<ProfileView> {
    const data: Prisma.UserProfileUpdateInput = {};

    if (dto.firstName !== undefined) data.firstName = dto.firstName;
    if (dto.lastName !== undefined) data.lastName = dto.lastName;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.addressLine !== undefined) data.addressLine = dto.addressLine;
    if (dto.avatarUrl !== undefined) data.avatarUrl = dto.avatarUrl;

    await this.prisma.userProfile.upsert({
      where: { userId },
      update: data,
      create: {
        userId,
        firstName: dto.firstName ?? null,
        lastName: dto.lastName ?? null,
        phone: dto.phone ?? null,
        addressLine: dto.addressLine ?? null,
        avatarUrl: dto.avatarUrl ?? null,
      },
    });

    await this.prisma.notification.create({
      data: { userId, kind: NotificationKind.PROFILE_UPDATED, metadata: {} },
    });

    return this.profile(userId);
  }

  /**
   * Closes the account for good.
   *
   * One `delete`, and the database does the rest: the profile, the roles, the
   * sessions, the reviews and every like on them, the likes given elsewhere,
   * the wish list, the address book, the saved cards, the notifications and
   * the orders all carry `ON DELETE CASCADE` back to this row. Nothing here
   * enumerates them, because a list in code is a list that goes stale the
   * first time a table is added and nobody remembers to come back.
   *
   * The audit trail is the exception: its link is `SET NULL`, so the record
   * that an account was deleted outlives the account without naming it.
   */
  async deleteAccount(
    user: RequestUser,
    dto: DeleteAccountDto,
    request: Request,
    response: Response,
  ): Promise<{ message: string }> {
    const record = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    });

    if (!record) throw new NotFoundException('No such account');

    if (!(await verifyPassword(record.passwordHash, dto.password))) {
      throw new UnauthorizedException('That password is not correct');
    }

    await this.assertNotLastAdmin(user.id);

    // Before the row goes: the profile names the file, and the profile is
    // about to cascade away. Afterwards nothing on disk could be traced back.
    await this.avatars.forget(user.id);

    // Awaited rather than fire-and-forget, and ordered before the delete. The
    // row is written with the user id and then quietly loses it to SET NULL;
    // written afterwards it would reference a user that no longer exists.
    await this.audit.write({ action: AuditAction.ACCOUNT_DELETED, userId: user.id, request });

    await this.prisma.user.delete({ where: { id: user.id } });

    // The session rows went with the user, but the browser still holds the
    // cookies naming them.
    this.sessions.clearCookies(response);

    return { message: 'Your account and everything in it has been deleted.' };
  }

  /**
   * Refuses to remove the last way back into the admin panel.
   *
   * Not a security control — an administrator can still delete another
   * administrator through the admin API. It is here because this particular
   * mistake cannot be undone from inside the application at all: the only
   * remedy is a hand-written row in the database.
   */
  private async assertNotLastAdmin(userId: string): Promise<void> {
    const isAdmin = await this.prisma.userRole.findFirst({
      where: { userId, role: { key: ROLES.ADMIN } },
      select: { userId: true },
    });

    if (!isAdmin) return;

    const admins = await this.prisma.userRole.count({ where: { role: { key: ROLES.ADMIN } } });

    if (admins <= 1) {
      throw new ConflictException(
        'This is the only administrator account. Make someone else an administrator first.',
      );
    }
  }
  async notifications(userId: string): Promise<NotificationView[]> {
    const rows = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      metadata: (row.metadata ?? {}) as Record<string, unknown>,
      read: row.readAt !== null,
      createdAt: row.createdAt,
    }));
  }

  /**
   * Scoped by user id as well as notification id, so a guessed id belonging to
   * someone else marks nothing and answers the same as an id that never was.
   */
  async markRead(userId: string, id: string): Promise<{ read: number }> {
    const { count } = await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });

    return { read: count };
  }

  async markAllRead(userId: string): Promise<{ read: number }> {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });

    return { read: count };
  }
}
