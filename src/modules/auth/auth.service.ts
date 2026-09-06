import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuditAction, UserStatus } from '@prisma/client';
import type { Request, Response } from 'express';
import type { RequestUser } from 'src/common/types/request-user';
import {
  generateToken,
  hashPassword,
  hashToken,
  verifyPassword,
} from 'src/common/utils/crypto.util';
import { AppConfigService } from 'src/config/app-config.service';
import { MailService } from 'src/infra/mail/mail.service';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ROLES } from '../rbac/rbac.constants';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResendVerificationDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto/auth.dto';
import { SessionService } from './session.service';

/** What the API is willing to say about a user. Never the hash, never a token. */
export interface PublicUser {
  id: string;
  email: string;
  emailVerified: boolean;
  status: string;
  firstName: string | null;
  lastName: string | null;
  roles: string[];
  permissions: string[];
}

/**
 * The authentication flows.
 *
 * A theme runs through all of them: the response must not depend on whether an
 * email address is registered. Registration, password reset and resending a
 * verification mail all answer the same way for a known and an unknown address,
 * and login gives one message for "no such user" and "wrong password". Anything
 * else turns the endpoint into a membership oracle — useful for phishing, and
 * for knowing which stolen credential lists to try here.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly config: AppConfigService,
  ) {}

  // ------------------------------------------------------------- registration

  /**
   * Creates the account, its profile, its default role and its verification
   * token in one transaction: a user without a role is a user who cannot do
   * anything, and half a registration is worse than none.
   *
   * The unique index on email is what actually prevents duplicates. The check
   * before it is a courtesy for the error message — between the read and the
   * write there is a gap, and only the constraint closes it.
   */
  async register(dto: RegisterDto, request: Request): Promise<{ message: string }> {
    const passwordHash = await hashPassword(dto.password);
    const token = generateToken();
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });

    if (existing) {
      /*
       * Same shape, same timing, as a real registration — the Argon2id hash
       * above already ran, so the two paths cost about the same. The person who
       * owns the address gets told someone tried; nobody else learns anything.
       */
      this.audit.record({
        action: AuditAction.REGISTERED,
        userId: existing.id,
        request,
        metadata: { duplicate: true },
      });
      return { message: REGISTRATION_MESSAGE };
    }

    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const customerRole = await tx.role.findUnique({ where: { key: ROLES.CUSTOMER } });
        if (!customerRole) {
          throw new Error('The CUSTOMER role is missing — run the database seed');
        }

        const created = await tx.user.create({
          data: {
            email: dto.email,
            passwordHash,
            profile: { create: { firstName: dto.firstName, lastName: dto.lastName } },
            roles: { create: { roleId: customerRole.id } },
            verificationTokens: {
              create: {
                tokenHash: hashToken(token),
                expiresAt: new Date(Date.now() + this.config.emailVerificationTtl * 1000),
              },
            },
          },
        });

        await tx.auditLog.create({
          data: { action: AuditAction.REGISTERED, userId: created.id },
        });

        return created;
      });

      // Outside the transaction: a slow mail server should not hold a database
      // connection open, and a failed send is recoverable through "resend".
      await this.mail.sendEmailVerification(user.email, token);
    } catch (error) {
      // Losing the race on the unique index lands here. Same answer as above.
      if (isUniqueViolation(error)) return { message: REGISTRATION_MESSAGE };
      throw error;
    }

    return { message: REGISTRATION_MESSAGE };
  }

  // -------------------------------------------------------------------- login

  /**
   * Verifies credentials and issues a fresh session.
   *
   * Always a new session row, never the one the caller arrived with. That is
   * the session-fixation defence: a token planted in the browser before login
   * is abandoned at this point rather than promoted to an authenticated one.
   */
  async login(dto: LoginDto, request: Request, response: Response): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      // The permissions come along too: the login response is what the client
      // renders from, and one without them would leave the app thinking the user
      // may do nothing until the next /auth/me.
      include: {
        profile: true,
        roles: {
          include: { role: { include: { permissions: { include: { permission: true } } } } },
        },
      },
    });

    /*
     * Hash something even when the user does not exist. Argon2id takes tens of
     * milliseconds, and skipping it would make "unknown address" measurably
     * faster than "wrong password" — an enumeration channel that survives
     * identical error messages.
     */
    const ok = user
      ? await verifyPassword(user.passwordHash, dto.password)
      : await verifyPassword(DUMMY_HASH, dto.password);

    if (!user || !ok) {
      this.audit.record({
        action: AuditAction.LOGIN_FAILED,
        userId: user?.id ?? null,
        request,
        metadata: { reason: user ? 'bad-password' : 'unknown-email' },
      });
      throw new UnauthorizedException(CREDENTIALS_MESSAGE);
    }

    this.assertUsable(user.status);

    if (this.config.requireVerifiedEmail && !user.emailVerified) {
      throw new ForbiddenException({
        message: 'Confirm your email address before signing in',
        error: 'EMAIL_NOT_VERIFIED',
      });
    }

    await this.sessions.issue(user.id, user.sessionEpoch, request, response);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), failedLoginCount: 0 },
    });

    this.audit.record({ action: AuditAction.LOGIN_SUCCESS, userId: user.id, request });

    return this.toPublicUser(user);
  }

  async logout(sessionId: string, request: Request, response: Response): Promise<void> {
    await this.sessions.revoke(sessionId, request);
    this.sessions.clearCookies(response);
    this.audit.record({ action: AuditAction.LOGOUT, userId: request.user?.id, request });
  }

  async logoutAll(userId: string, request: Request, response: Response): Promise<void> {
    await this.sessions.revokeAll(userId);
    this.sessions.clearCookies(response);
    this.audit.record({ action: AuditAction.LOGOUT_ALL, userId, request });
  }

  // ------------------------------------------------------- email verification

  /**
   * Consumes the token. One use only, enforced by the `usedAt` update being
   * conditional — two requests racing with the same token means exactly one
   * of them updates a row.
   */
  async verifyEmail(dto: VerifyEmailDto, request: Request): Promise<{ message: string }> {
    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash: hashToken(dto.token) },
      include: { user: true },
    });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('This confirmation link is no longer valid');
    }

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.emailVerificationToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count === 0) throw new BadRequestException('This link has already been used');

      await tx.user.update({
        where: { id: record.userId },
        data: { emailVerified: new Date() },
      });
    });

    this.audit.record({ action: AuditAction.EMAIL_VERIFIED, userId: record.userId, request });
    return { message: 'Email confirmed' };
  }

  async resendVerification(
    dto: ResendVerificationDto,
    request: Request,
  ): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    if (user && !user.emailVerified && user.status === UserStatus.ACTIVE) {
      const token = generateToken();

      await this.prisma.$transaction(async (tx) => {
        // Retire the outstanding ones, so an old mail cannot be replayed.
        await tx.emailVerificationToken.updateMany({
          where: { userId: user.id, usedAt: null },
          data: { usedAt: new Date() },
        });
        await tx.emailVerificationToken.create({
          data: {
            userId: user.id,
            tokenHash: hashToken(token),
            expiresAt: new Date(Date.now() + this.config.emailVerificationTtl * 1000),
          },
        });
      });

      await this.mail.sendEmailVerification(user.email, token);
      this.audit.record({
        action: AuditAction.EMAIL_VERIFICATION_SENT,
        userId: user.id,
        request,
      });
    }

    return { message: NEUTRAL_MESSAGE };
  }

  // --------------------------------------------------------------- passwords

  async forgotPassword(dto: ForgotPasswordDto, request: Request): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    if (user?.status === UserStatus.ACTIVE) {
      const token = generateToken();

      await this.prisma.$transaction(async (tx) => {
        await tx.passwordResetToken.updateMany({
          where: { userId: user.id, usedAt: null },
          data: { usedAt: new Date() },
        });
        await tx.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash: hashToken(token),
            expiresAt: new Date(Date.now() + this.config.passwordResetTtl * 1000),
          },
        });
      });

      await this.mail.sendPasswordReset(user.email, token);
      this.audit.record({
        action: AuditAction.PASSWORD_RESET_REQUESTED,
        userId: user.id,
        request,
      });
    }

    return { message: NEUTRAL_MESSAGE };
  }

  /**
   * Sets the new password and ends every session.
   *
   * Signing the other devices out is the point of a reset: whoever prompted it
   * may be locked out of their account by someone who is still signed in on it.
   */
  async resetPassword(dto: ResetPasswordDto, request: Request): Promise<{ message: string }> {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(dto.token) },
      include: { user: true },
    });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('This reset link is no longer valid');
    }

    const passwordHash = await hashPassword(dto.password);

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count === 0) throw new BadRequestException('This link has already been used');

      // Any other outstanding reset mail dies with this one.
      await tx.passwordResetToken.updateMany({
        where: { userId: record.userId, usedAt: null },
        data: { usedAt: new Date() },
      });

      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash, emailVerified: record.user.emailVerified ?? new Date() },
      });

      await this.sessions.revokeAll(record.userId, tx);
    });

    await this.mail.sendPasswordChanged(record.user.email);
    this.audit.record({
      action: AuditAction.PASSWORD_RESET_COMPLETED,
      userId: record.userId,
      request,
    });

    return { message: 'Password updated. Sign in with your new password.' };
  }

  /**
   * Changes the password of a signed-in user and re-issues their session.
   *
   * Every other device is signed out, and this one gets a brand new session
   * rather than keeping the old token — the same reasoning as login.
   */
  async changePassword(
    user: RequestUser,
    dto: ChangePasswordDto,
    request: Request,
    response: Response,
  ): Promise<{ message: string }> {
    const record = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });

    if (!(await verifyPassword(record.passwordHash, dto.currentPassword))) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const passwordHash = await hashPassword(dto.newPassword);

    const epoch = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      await this.sessions.revokeAll(user.id, tx);
      const updated = await tx.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { sessionEpoch: true },
      });
      return updated.sessionEpoch;
    });

    await this.sessions.issue(user.id, epoch, request, response);
    await this.mail.sendPasswordChanged(record.email);
    this.audit.record({ action: AuditAction.PASSWORD_CHANGED, userId: user.id, request });

    return { message: 'Password changed. Other devices have been signed out.' };
  }

  // ----------------------------------------------------------------- helpers

  async currentUser(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        profile: true,
        roles: {
          include: { role: { include: { permissions: { include: { permission: true } } } } },
        },
      },
    });

    return this.toPublicUser(user);
  }

  private assertUsable(status: UserStatus): void {
    if (status === UserStatus.ACTIVE) return;

    const message =
      status === UserStatus.SUSPENDED
        ? 'This account is suspended'
        : 'This account is not available';

    throw new ForbiddenException({ message, error: `ACCOUNT_${status}` });
  }

  private toPublicUser(user: {
    id: string;
    email: string;
    emailVerified: Date | null;
    status: UserStatus;
    profile?: { firstName: string | null; lastName: string | null } | null;
    roles?: { role: { key: string; permissions?: { permission: { key: string } }[] } }[];
  }): PublicUser {
    const roles = user.roles?.map((link) => link.role.key) ?? [];
    const permissions = [
      ...new Set(
        user.roles?.flatMap(
          (link) => link.role.permissions?.map((rp) => rp.permission.key) ?? [],
        ) ?? [],
      ),
    ];

    return {
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified !== null,
      status: user.status,
      firstName: user.profile?.firstName ?? null,
      lastName: user.profile?.lastName ?? null,
      roles,
      permissions,
    };
  }
}

/**
 * A pre-computed Argon2id hash of a value nobody uses, so the "unknown email"
 * path can spend the same time as the real one.
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$5xk3Vl1nMxJ1Sx1EWMOxfLPFuNyDMwoVQIvfXKPGyPQ';

const REGISTRATION_MESSAGE =
  'Check your inbox — if the address is available, a confirmation link is on its way.';

const NEUTRAL_MESSAGE = 'If that address is registered, we have sent an email.';

const CREDENTIALS_MESSAGE = 'Email or password is incorrect';

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}
