import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions } from 'express';
import type { Env } from './env.schema';

/**
 * Typed reader over the validated environment.
 *
 * Everything that needs a setting goes through here rather than touching
 * `process.env`, so the shape is checked once at boot and the derived values —
 * cookie flags, allowed origins — are computed in exactly one place.
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  private get<K extends keyof Env>(key: K): Env[K] {
    return this.config.get(key, { infer: true });
  }

  get nodeEnv(): Env['NODE_ENV'] {
    return this.get('NODE_ENV');
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get port(): number {
    return this.get('PORT');
  }

  get trustProxy(): boolean {
    return this.get('TRUST_PROXY');
  }

  get redisUrl(): string {
    return this.get('REDIS_URL');
  }

  get frontendUrl(): string {
    return this.get('FRONTEND_URL');
  }

  /**
   * Origins allowed to send credentialed requests. Never a wildcard: a browser
   * refuses `Access-Control-Allow-Origin: *` together with credentials, and
   * echoing back whatever Origin arrived would defeat the point of the list.
   */
  get corsOrigins(): string[] {
    const extra = this.get('CORS_ORIGINS');
    const listed = extra
      ? extra
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean)
      : [];
    return [...new Set([this.frontendUrl, ...listed])];
  }

  get sessionSecret(): string {
    return this.get('SESSION_SECRET');
  }

  /** Seconds of inactivity after which a session stops being accepted. */
  get sessionIdleTimeout(): number {
    return this.get('SESSION_IDLE_TIMEOUT');
  }

  /** Seconds from creation after which a session dies however active it was. */
  get sessionMaxAge(): number {
    return this.get('SESSION_MAX_AGE');
  }

  get emailVerificationTtl(): number {
    return this.get('EMAIL_VERIFICATION_TTL');
  }

  get passwordResetTtl(): number {
    return this.get('PASSWORD_RESET_TTL');
  }

  get requireVerifiedEmail(): boolean {
    return this.get('REQUIRE_VERIFIED_EMAIL');
  }

  /**
   * Cookie flags for the session token.
   *
   * `secure` defaults to whatever production implies unless the environment
   * says otherwise, `httpOnly` is not negotiable, and `path: '/'` keeps the
   * cookie on every API route rather than only the auth ones.
   */
  cookieOptions(maxAgeSeconds?: number): CookieOptions {
    const secure = this.get('COOKIE_SECURE') ?? this.isProduction;
    const domain = this.get('COOKIE_DOMAIN');

    return {
      httpOnly: true,
      secure,
      sameSite: this.get('COOKIE_SAME_SITE'),
      path: '/',
      ...(domain ? { domain } : {}),
      ...(maxAgeSeconds !== undefined ? { maxAge: maxAgeSeconds * 1000 } : {}),
    };
  }

  /**
   * The CSRF cookie is the one cookie the browser app must read, so it is the
   * only one without `httpOnly` — see CsrfGuard for why that is safe.
   */
  csrfCookieOptions(maxAgeSeconds?: number): CookieOptions {
    return { ...this.cookieOptions(maxAgeSeconds), httpOnly: false };
  }

  get mail(): {
    transport: Env['MAIL_TRANSPORT'];
    from: string;
    smtp: { host?: string; port?: number; user?: string; password?: string; secure: boolean };
  } {
    return {
      transport: this.get('MAIL_TRANSPORT'),
      from: this.get('MAIL_FROM'),
      smtp: {
        host: this.get('SMTP_HOST'),
        port: this.get('SMTP_PORT'),
        user: this.get('SMTP_USER'),
        password: this.get('SMTP_PASSWORD'),
        secure: this.get('SMTP_SECURE'),
      },
    };
  }

  get rateLimits(): Record<'login' | 'signup' | 'reset', { max: number; windowSeconds: number }> {
    return {
      login: {
        max: this.get('RATE_LIMIT_LOGIN_MAX'),
        windowSeconds: this.get('RATE_LIMIT_LOGIN_WINDOW'),
      },
      signup: {
        max: this.get('RATE_LIMIT_SIGNUP_MAX'),
        windowSeconds: this.get('RATE_LIMIT_SIGNUP_WINDOW'),
      },
      reset: {
        max: this.get('RATE_LIMIT_RESET_MAX'),
        windowSeconds: this.get('RATE_LIMIT_RESET_WINDOW'),
      },
    };
  }
}
