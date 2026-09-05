import { UserStatus } from '@prisma/client';
import { hashToken } from 'src/common/utils/crypto.util';
import { SessionService } from './session.service';

/**
 * The session rules, in isolation from the database.
 *
 * These are the cases where getting it wrong is invisible until it matters: a
 * session that outlives a password change, one that survives suspension, one
 * whose token was stored in the clear.
 */

const config = {
  sessionMaxAge: 2_592_000,
  sessionIdleTimeout: 604_800,
  cookieOptions: () => ({ httpOnly: true, secure: true, sameSite: 'lax', path: '/' }),
  csrfCookieOptions: () => ({ httpOnly: false, secure: true, sameSite: 'lax', path: '/' }),
} as unknown as ConstructorParameters<typeof SessionService>[1];

const audit = { record: jest.fn(), write: jest.fn() } as unknown as ConstructorParameters<
  typeof SessionService
>[2];

function sessionRow(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    id: 's1',
    userId: 'u1',
    epoch: 0,
    tokenHash: 'unused',
    createdAt: new Date(now),
    lastUsedAt: new Date(now),
    expiresAt: new Date(now + 86_400_000),
    revokedAt: null,
    ipAddress: null,
    userAgent: null,
    user: {
      id: 'u1',
      email: 'robert@example.com',
      emailVerified: new Date(),
      status: UserStatus.ACTIVE as UserStatus,
      sessionEpoch: 0,
      roles: [
        {
          role: {
            key: 'CUSTOMER',
            permissions: [{ permission: { key: 'products.read' } }],
          },
        },
      ],
    },
    ...overrides,
  };
}

function serviceWith(row: unknown) {
  const prisma = {
    session: { findUnique: jest.fn().mockResolvedValue(row), update: jest.fn(), create: jest.fn() },
  } as unknown as ConstructorParameters<typeof SessionService>[0];

  return new SessionService(prisma, config, audit);
}

describe('SessionService.resolve', () => {
  it('returns the identity and flattens roles into permissions', async () => {
    const resolved = await serviceWith(sessionRow()).resolve('a-token');

    expect(resolved?.user.id).toBe('u1');
    expect(resolved?.user.roles).toEqual(['CUSTOMER']);
    expect(resolved?.user.permissions).toEqual(['products.read']);
  });

  it('refuses when there is no cookie', async () => {
    await expect(serviceWith(sessionRow()).resolve(undefined)).resolves.toBeNull();
  });

  it('looks the session up by hash, never by the token itself', async () => {
    const prisma = {
      session: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
        create: jest.fn(),
      },
    } as unknown as ConstructorParameters<typeof SessionService>[0];

    await new SessionService(prisma, config, audit).resolve('the-secret-token');

    const where = (prisma.session.findUnique as jest.Mock).mock.calls[0][0].where;
    expect(where.tokenHash).toBe(hashToken('the-secret-token'));
    expect(JSON.stringify(where)).not.toContain('the-secret-token');
  });

  it('refuses a revoked session', async () => {
    const row = sessionRow({ revokedAt: new Date() });
    await expect(serviceWith(row).resolve('a-token')).resolves.toBeNull();
  });

  it('refuses a session past its absolute expiry', async () => {
    const row = sessionRow({ expiresAt: new Date(Date.now() - 1000) });
    await expect(serviceWith(row).resolve('a-token')).resolves.toBeNull();
  });

  it('refuses a session that has been idle too long, before its row expires', async () => {
    const row = sessionRow({
      lastUsedAt: new Date(Date.now() - 605_000_000),
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    await expect(serviceWith(row).resolve('a-token')).resolves.toBeNull();
  });

  it('refuses a session issued before the epoch moved — the password change case', async () => {
    const row = sessionRow();
    row.user.sessionEpoch = 1; // bumped by a password change or log-out-everywhere
    await expect(serviceWith(row).resolve('a-token')).resolves.toBeNull();
  });

  it.each([UserStatus.SUSPENDED, UserStatus.BANNED, UserStatus.DELETED])(
    'refuses a live session on a %s account',
    async (status) => {
      const row = sessionRow();
      row.user.status = status;
      await expect(serviceWith(row).resolve('a-token')).resolves.toBeNull();
    },
  );
});

describe('SessionService cookies', () => {
  it('sets the session cookie HttpOnly and the CSRF cookie readable', () => {
    const response = { cookie: jest.fn(), clearCookie: jest.fn() } as never;
    serviceWith(sessionRow()).setCookies(response, 'a-token');

    const calls = (response as unknown as { cookie: jest.Mock }).cookie.mock.calls;
    const [sessionName, , sessionOptions] = calls[0];
    const [, , csrfOptions] = calls[1];

    expect(sessionName).toBe('krist_session');
    expect(sessionOptions.httpOnly).toBe(true);
    expect(sessionOptions.secure).toBe(true);
    // The one cookie the browser app must read, so it can echo it in a header.
    expect(csrfOptions.httpOnly).toBe(false);
  });
});
