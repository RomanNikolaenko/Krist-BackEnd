import { Injectable } from '@nestjs/common';
import { AuditAction, Prisma, Session, UserStatus } from '@prisma/client';
import type { Request, Response } from 'express';
import { CSRF_COOKIE, SESSION_COOKIE } from 'src/common/constants';
import type { RequestUser } from 'src/common/types/request-user';
import { generateToken, hashToken } from 'src/common/utils/crypto.util';
import { AppConfigService } from 'src/config/app-config.service';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { AuditService, clientIp, userAgent } from '../audit/audit.service';

export interface ResolvedSession {
  readonly session: Session;
  readonly user: RequestUser;
}

/**
 * Server-side sessions: the browser holds an opaque token, the server holds
 * everything else.
 *
 * The token is 256 bits of randomness that exists in plaintext exactly twice —
 * in the Set-Cookie header on the way out, and in the request cookie on the way
 * back. What the database keeps is its SHA-256, so a dump of the sessions table
 * cannot be replayed against the API.
 *
 * Two clocks bound a session. `expiresAt` is the absolute ceiling, fixed at
 * creation. Idle timeout is measured from `lastUsedAt` at read time, which is
 * why a session can be rejected before its row expires.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Issues a brand new session and sets the cookies.
   *
   * Always a new row, never a reused one — that is the defence against session
   * fixation. Whatever token the caller arrived with is abandoned here, so a
   * token planted before login cannot survive it.
   */
  async issue(
    userId: string,
    epoch: number,
    request: Request,
    response: Response,
  ): Promise<Session> {
    const token = generateToken();
    const expiresAt = new Date(Date.now() + this.config.sessionMaxAge * 1000);

    const session = await this.prisma.session.create({
      data: {
        userId,
        epoch,
        tokenHash: hashToken(token),
        expiresAt,
        ipAddress: clientIp(request),
        userAgent: userAgent(request),
      },
    });

    this.setCookies(response, token);
    this.audit.record({
      action: AuditAction.SESSION_CREATED,
      userId,
      request,
      metadata: { sessionId: session.id },
    });

    return session;
  }

  /**
   * Validates the token from the cookie and returns the identity behind it.
   *
   * Null for every failure mode — missing, unknown, revoked, expired, idled
   * out, superseded by an epoch bump, or belonging to an account that is no
   * longer allowed in. The caller cannot tell which, and neither can the client.
   */
  async resolve(token: string | undefined): Promise<ResolvedSession | null> {
    if (!token) return null;

    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: {
        user: {
          include: {
            roles: {
              include: { role: { include: { permissions: { include: { permission: true } } } } },
            },
          },
        },
      },
    });

    if (!session || session.revokedAt) return null;

    const now = Date.now();
    if (session.expiresAt.getTime() <= now) return null;

    const idleDeadline = session.lastUsedAt.getTime() + this.config.sessionIdleTimeout * 1000;
    if (idleDeadline <= now) return null;

    // A password change or a "log out everywhere" bumps the user's epoch,
    // retiring every session issued before it without touching their rows.
    if (session.epoch !== session.user.sessionEpoch) return null;

    if (session.user.status !== UserStatus.ACTIVE) return null;

    const roles = session.user.roles.map((link) => link.role.key);
    const permissions = [
      ...new Set(
        session.user.roles.flatMap((link) => link.role.permissions.map((rp) => rp.permission.key)),
      ),
    ];

    return {
      session,
      user: {
        id: session.user.id,
        email: session.user.email,
        emailVerified: session.user.emailVerified !== null,
        status: session.user.status,
        roles,
        permissions,
      },
    };
  }

  /**
   * Slides the idle window forward, but not on every request: a busy tab would
   * otherwise write a row per click. A minute of granularity is plenty for a
   * timeout measured in days.
   */
  async touch(session: Session): Promise<void> {
    if (Date.now() - session.lastUsedAt.getTime() < 60_000) return;

    await this.prisma.session.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date() },
    });
  }

  async revoke(sessionId: string, request?: Request): Promise<void> {
    const session = await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (session.count > 0) {
      this.audit.record({
        action: AuditAction.SESSION_REVOKED,
        request,
        metadata: { sessionId },
      });
    }
  }

  /**
   * Ends every session the user has, including the one making the request.
   *
   * Bumping the epoch is what makes this immediate: any session already in
   * flight fails its next `resolve` even if the row update has not landed yet.
   */
  async revokeAll(userId: string, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.prisma;

    await client.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await client.user.update({
      where: { id: userId },
      data: { sessionEpoch: { increment: 1 } },
    });
  }

  /** Everything the user should see on their "signed-in devices" screen. */
  async listActive(userId: string): Promise<Session[]> {
    return this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
    });
  }

  /**
   * The session cookie and the CSRF cookie are set together and cleared
   * together, so the two can never drift apart.
   */
  setCookies(response: Response, token: string): void {
    response.cookie(SESSION_COOKIE, token, this.config.cookieOptions(this.config.sessionMaxAge));
    response.cookie(
      CSRF_COOKIE,
      generateToken(24),
      this.config.csrfCookieOptions(this.config.sessionMaxAge),
    );
  }

  clearCookies(response: Response): void {
    // Same flags as when they were set, or the browser keeps the originals.
    response.clearCookie(SESSION_COOKIE, this.config.cookieOptions());
    response.clearCookie(CSRF_COOKIE, this.config.csrfCookieOptions());
  }

  /** Housekeeping for a scheduled job: drop rows nobody can use any more. */
  async pruneExpired(): Promise<number> {
    const { count } = await this.prisma.session.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { revokedAt: { lt: new Date(Date.now() - 30 * 24 * 3600 * 1000) } },
        ],
      },
    });
    return count;
  }
}
