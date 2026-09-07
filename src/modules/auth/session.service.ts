import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
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
 * One clock bounds a session, and it slides. `expiresAt` starts a window ahead
 * and every request pushes it another window out, so a session in continuous
 * use never expires and one left alone for a whole window does. There is no
 * absolute ceiling behind it, and no refresh token: the server reads the
 * session on every request, so it can end one whenever it likes — which leaves
 * a second token nothing to do.
 */
@Injectable()
export class SessionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SessionService.name);
  private timer?: NodeJS.Timeout;

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
    const expiresAt = new Date(Date.now() + this.config.sessionIdleTimeout * 1000);

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
   * Null for every failure mode — missing, unknown, signed out, expired, idled
   * out, superseded by an epoch bump, or belonging to an account that is no
   * longer allowed in. The caller cannot tell which, and neither can the client.
   * A session that was signed out has no row at all, so it arrives here as
   * indistinguishable from a token that was never issued.
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

    if (!session) return null;

    // One deadline, and it moves: `touch` pushes it forward on every request,
    // so this rejects exactly the sessions that have gone quiet for a whole
    // window — there is no second, absolute clock behind it.
    if (session.expiresAt.getTime() <= Date.now()) return null;

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
   * Renews the session. This is the whole of it.
   *
   * There is no refresh token and no refresh endpoint: a request inside the
   * window pushes the deadline out by another window, and silence past it lets
   * the session die on its own. Used continuously, a session lasts as long as
   * somebody keeps using it.
   *
   * The cookie is re-sent with the row, or the browser would keep the Max-Age
   * it got at sign-in and throw the cookie away while the server still
   * considered the session live.
   *
   * Written at most once a minute. A busy tab would otherwise cost a row write
   * per click, and a minute of slack against a window measured in hours or days
   * changes nothing.
   */
  async touch(session: Session, token: string, response: Response): Promise<void> {
    if (Date.now() - session.lastUsedAt.getTime() < 60_000) return;

    const now = new Date();

    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        lastUsedAt: now,
        expiresAt: new Date(now.getTime() + this.config.sessionIdleTimeout * 1000),
      },
    });

    this.setSessionCookie(response, token);
  }

  /**
   * Ends a session by deleting its row.
   *
   * The row is not kept as a tombstone. Nothing read it: the signed-in-devices
   * screen lists live sessions only, and `resolve` treats "no row" and "dead
   * row" identically. The history lives in `audit_logs`, which records the
   * revocation with its address and user agent — a fuller record than the
   * session row was, and one that outlives it.
   */
  async revoke(sessionId: string, request?: Request): Promise<void> {
    const { count } = await this.prisma.session.deleteMany({ where: { id: sessionId } });

    if (count > 0) {
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

    await client.session.deleteMany({ where: { userId } });
    await client.user.update({
      where: { id: userId },
      data: { sessionEpoch: { increment: 1 } },
    });
  }

  /** Everything the user should see on their "signed-in devices" screen. */
  async listActive(userId: string): Promise<Session[]> {
    return this.prisma.session.findMany({
      where: { userId, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
    });
  }

  /**
   * The session cookie and the CSRF cookie are set together and cleared
   * together, so the two can never drift apart.
   */
  setCookies(response: Response, token: string): void {
    this.setSessionCookie(response, token);
    response.cookie(
      CSRF_COOKIE,
      generateToken(24),
      this.config.csrfCookieOptions(this.config.sessionIdleTimeout),
    );
  }

  /**
   * The session cookie on its own, so sliding the window does not rotate the
   * CSRF token underneath a page that is already holding one.
   */
  private setSessionCookie(response: Response, token: string): void {
    response.cookie(
      SESSION_COOKIE,
      token,
      this.config.cookieOptions(this.config.sessionIdleTimeout),
    );
  }

  clearCookies(response: Response): void {
    // Same flags as when they were set, or the browser keeps the originals.
    response.clearCookie(SESSION_COOKIE, this.config.cookieOptions());
    response.clearCookie(CSRF_COOKIE, this.config.csrfCookieOptions());
  }

  /**
   * Drops the rows that can no longer authenticate anybody.
   *
   * Two ways a session dies of old age, and both are swept here: past its
   * absolute ceiling, or quiet for longer than the idle window. `resolve`
   * already refuses them, so this only stops the table growing without end.
   */
  async pruneExpired(): Promise<number> {
    const { count } = await this.prisma.session.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });

    return count;
  }

  /**
   * Runs the sweep on a timer.
   *
   * A plain interval rather than a scheduler package: one dependency for one
   * job every six hours is not a trade worth making, and the delete is
   * idempotent, so several replicas running it at once is harmless rather than
   * something to coordinate. `unref` keeps it from holding the process open at
   * shutdown.
   */
  onModuleInit(): void {
    const sweep = () => {
      void this.pruneExpired()
        .then((count) => {
          if (count) this.logger.log(`Pruned ${count} session(s) nobody could use`);
        })
        .catch((error: unknown) => {
          // Housekeeping must never be the reason the process falls over.
          this.logger.warn(`Session prune failed: ${(error as Error).message}`);
        });
    };

    sweep();
    this.timer = setInterval(sweep, 6 * 60 * 60 * 1000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
