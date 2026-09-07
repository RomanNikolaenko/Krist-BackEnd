import { z } from 'zod';

/**
 * Every environment-dependent setting the server reads, in one place.
 *
 * The process refuses to start if anything here is missing or malformed, which
 * is deliberate: a session cookie that quietly falls back to `secure: false`
 * in production is the kind of default that only shows up in an incident.
 */

const duration = (fallback: number) => z.coerce.number().int().positive().default(fallback);

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),

    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),

    /// Where the browser app lives. Also the only origin CORS lets through
    /// with credentials — a comma-separated list for multi-domain setups.
    FRONTEND_URL: z.string().url(),
    CORS_ORIGINS: z.string().optional(),

    /// Signs the session cookie and keys the CSRF token HMAC. At least 32
    /// characters, and never a value that has been committed anywhere.
    SESSION_SECRET: z.string().min(32),

    COOKIE_DOMAIN: z.string().optional(),
    COOKIE_SECURE: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
    COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),

    /// Seconds of quiet before a session dies.
    ///
    /// The only clock a session has. Every request pushes the deadline out by
    /// another window, so one in continuous use never expires — there is no
    /// second, absolute ceiling behind it.
    SESSION_IDLE_TIMEOUT: duration(60 * 60 * 24 * 7),

    EMAIL_VERIFICATION_TTL: duration(60 * 60 * 24),
    PASSWORD_RESET_TTL: duration(60 * 60),

    /// Whether an unverified address may hold a session at all.
    REQUIRE_VERIFIED_EMAIL: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .default('false'),

    MAIL_TRANSPORT: z.enum(['log', 'smtp']).default('log'),
    MAIL_FROM: z.string().default('Krist <no-reply@krist.local>'),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SMTP_SECURE: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .default('false'),

    RATE_LIMIT_LOGIN_MAX: z.coerce.number().int().positive().default(10),
    RATE_LIMIT_LOGIN_WINDOW: duration(15 * 60),
    RATE_LIMIT_SIGNUP_MAX: z.coerce.number().int().positive().default(5),
    RATE_LIMIT_SIGNUP_WINDOW: duration(60 * 60),
    RATE_LIMIT_RESET_MAX: z.coerce.number().int().positive().default(5),
    RATE_LIMIT_RESET_WINDOW: duration(60 * 60),

    /// Trust the first X-Forwarded-For hop. Only turn this on behind a proxy
    /// you control, or clients can forge their own IP for rate limiting.
    TRUST_PROXY: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .default('false'),
  })
  .superRefine((env, ctx) => {
    if (env.MAIL_TRANSPORT === 'smtp' && !env.SMTP_HOST) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SMTP_HOST'],
        message: 'SMTP_HOST is required when MAIL_TRANSPORT is "smtp"',
      });
    }

    if (env.NODE_ENV === 'production' && env.COOKIE_SECURE === false) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['COOKIE_SECURE'],
        message: 'COOKIE_SECURE cannot be false in production',
      });
    }

    // SameSite=None is only meaningful over HTTPS, and browsers reject the
    // pair outright — better to fail at boot than to ship a cookie nobody keeps.
    if (env.COOKIE_SAME_SITE === 'none' && env.COOKIE_SECURE === false) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['COOKIE_SAME_SITE'],
        message: 'COOKIE_SAME_SITE=none requires COOKIE_SECURE=true',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);

  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${detail}`);
  }

  return parsed.data;
}
