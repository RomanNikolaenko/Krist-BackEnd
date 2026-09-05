import { Injectable, Logger } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from 'src/infra/prisma/prisma.service';

export interface AuditEntry {
  readonly action: AuditAction;
  readonly userId?: string | null;
  readonly request?: Pick<Request, 'ip' | 'headers'>;
  /** Small, non-sensitive context. Never a password, token or secret. */
  readonly metadata?: Prisma.InputJsonValue;
}

/**
 * The security trail: who did what, from where, and when.
 *
 * Writes are fire-and-forget on purpose. An audit row is evidence, not part of
 * the transaction the user is waiting on — a logging failure must never turn a
 * successful login into a 500, and a failed login must still be recorded even
 * though the request itself is about to be rejected.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  record(entry: AuditEntry): void {
    void this.write(entry);
  }

  /** Awaited variant, for the tests and for anything inside a transaction. */
  async write(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action: entry.action,
          userId: entry.userId ?? null,
          ipAddress: entry.request ? clientIp(entry.request) : null,
          userAgent: entry.request ? userAgent(entry.request) : null,
          metadata: entry.metadata,
        },
      });
    } catch (error) {
      this.logger.error(`Could not record ${entry.action}: ${(error as Error).message}`);
    }
  }
}

/**
 * Express already resolves `ip` from X-Forwarded-For when `trust proxy` is on,
 * which is why that setting is gated behind an environment variable: without a
 * proxy in front, a client could name its own address and dodge rate limiting.
 */
export function clientIp(request: Pick<Request, 'ip' | 'headers'>): string | null {
  return request.ip ?? null;
}

export function userAgent(request: Pick<Request, 'headers'>): string | null {
  const value = request.headers['user-agent'];
  return typeof value === 'string' ? value.slice(0, 512) : null;
}
