import { validateEnv } from './env.schema';

/**
 * The boot-time guard rails. Each of these is a misconfiguration that would
 * otherwise ship quietly and only show up as "sessions do not stick" — or, worse,
 * not show up at all.
 */

const base = {
  DATABASE_URL: 'postgresql://krist:krist@localhost:5432/krist',
  REDIS_URL: 'redis://localhost:6379',
  FRONTEND_URL: 'http://localhost:4200',
  SESSION_SECRET: 'a'.repeat(32),
};

describe('environment validation', () => {
  it('accepts a minimal development configuration and fills in the defaults', () => {
    const env = validateEnv(base);

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.COOKIE_SAME_SITE).toBe('lax');
    expect(env.SESSION_IDLE_TIMEOUT).toBeGreaterThan(0);
  });

  it('refuses a session secret short enough to be guessed', () => {
    expect(() => validateEnv({ ...base, SESSION_SECRET: 'too-short' })).toThrow(/SESSION_SECRET/);
  });

  it('refuses to run in production with insecure cookies', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'production', COOKIE_SECURE: 'false' })).toThrow(
      /COOKIE_SECURE/,
    );
  });

  it('refuses SameSite=None without Secure, which browsers drop anyway', () => {
    expect(() =>
      validateEnv({ ...base, COOKIE_SAME_SITE: 'none', COOKIE_SECURE: 'false' }),
    ).toThrow(/COOKIE_SAME_SITE/);
  });

  it('refuses the SMTP transport with no host to send through', () => {
    expect(() => validateEnv({ ...base, MAIL_TRANSPORT: 'smtp' })).toThrow(/SMTP_HOST/);
  });

  it('refuses a malformed database url rather than failing on first query', () => {
    expect(() => validateEnv({ ...base, DATABASE_URL: 'localhost' })).toThrow(/DATABASE_URL/);
  });

  it('reports every problem at once, not one per restart', () => {
    expect(() => validateEnv({ ...base, SESSION_SECRET: 'short', REDIS_URL: 'nope' })).toThrow(
      /SESSION_SECRET[\s\S]*REDIS_URL|REDIS_URL[\s\S]*SESSION_SECRET/,
    );
  });

  it('coerces the numeric settings from their string environment form', () => {
    const env = validateEnv({ ...base, PORT: '8080', SESSION_IDLE_TIMEOUT: '3600' });

    expect(env.PORT).toBe(8080);
    expect(env.SESSION_IDLE_TIMEOUT).toBe(3600);
  });
});
