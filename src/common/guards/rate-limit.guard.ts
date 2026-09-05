import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AppConfigService } from 'src/config/app-config.service';
import { RedisService } from 'src/infra/redis/redis.service';
import { RATE_LIMIT_KEY } from '../constants';
import type { RateLimitOptions } from '../decorators/rate-limit.decorator';
import { hashToken } from '../utils/crypto.util';

/**
 * Fixed-window rate limiting on the authentication endpoints, counted in Redis.
 *
 * The shape of the protection matters as much as its existence. Counting per
 * IP alone lets a botnet spread a credential-stuffing run thin enough to stay
 * under the limit; counting per account alone hands anyone a way to lock a
 * stranger out by failing their login on purpose. So the sensitive endpoints
 * count both, and either budget can refuse the request.
 *
 * Nothing here locks an account. Exceeding a limit costs a wait measured in
 * minutes, never a state change on the user — that is the difference between
 * slowing an attacker down and letting them do the damage for us.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
    private readonly config: AppConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!options) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const budget = this.config.rateLimits[options.bucket];
    const keys = this.keysFor(options, request);

    try {
      for (const key of keys) {
        const { count, ttl } = await this.redis.hit(key, budget.windowSeconds);
        if (count > budget.max) {
          throw new HttpException(
            {
              statusCode: HttpStatus.TOO_MANY_REQUESTS,
              message: 'Too many attempts. Try again later.',
              retryAfter: ttl,
            },
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
      }
    } catch (error) {
      if (error instanceof HttpException) throw error;

      /*
       * Redis is down. Failing closed would take the whole login flow offline
       * with the cache, which is a worse outcome than a window without rate
       * limiting — the endpoints behind this still hash passwords with Argon2id
       * and still refuse wrong credentials. Loudly, so it is not silent.
       */
      this.logger.error(`Rate limiting unavailable, allowing request: ${(error as Error).message}`);
    }

    return true;
  }

  private keysFor(options: RateLimitOptions, request: Request): string[] {
    const ip = request.ip ?? 'unknown';
    const keys = [`rl:${options.bucket}:ip:${ip}`];

    if (options.keyFrom === 'ip+email') {
      const body = request.body as { email?: unknown } | undefined;
      const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : null;

      // Hashed, because a Redis key is a place an address would otherwise sit
      // in the clear for the length of the window.
      if (email) keys.push(`rl:${options.bucket}:id:${hashToken(email).slice(0, 32)}`);
    }

    return keys;
  }
}
