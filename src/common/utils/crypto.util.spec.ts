import { generateToken, hashPassword, hashToken, safeEqual, verifyPassword } from './crypto.util';

describe('password hashing', () => {
  it('produces a verifiable Argon2id hash', async () => {
    const hash = await hashPassword('Correct-Horse-1');

    expect(hash.startsWith('$argon2id$')).toBe(true);
    await expect(verifyPassword(hash, 'Correct-Horse-1')).resolves.toBe(true);
  });

  it('rejects the wrong password', async () => {
    const hash = await hashPassword('Correct-Horse-1');
    await expect(verifyPassword(hash, 'correct-horse-1')).resolves.toBe(false);
  });

  it('never stores the password itself', async () => {
    const hash = await hashPassword('Correct-Horse-1');
    expect(hash).not.toContain('Correct-Horse-1');
  });

  it('salts, so the same password hashes differently every time', async () => {
    const [a, b] = await Promise.all([
      hashPassword('Same-Password-1'),
      hashPassword('Same-Password-1'),
    ]);
    expect(a).not.toBe(b);
  });

  it('reads a corrupt hash as a failed check rather than throwing', async () => {
    await expect(verifyPassword('not-a-hash', 'anything')).resolves.toBe(false);
  });
});

describe('tokens', () => {
  it('is long enough to be unguessable and url-safe', () => {
    const token = generateToken();

    expect(token.length).toBeGreaterThanOrEqual(43); // 32 bytes, base64url
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('does not repeat', () => {
    const tokens = new Set(Array.from({ length: 500 }, () => generateToken()));
    expect(tokens.size).toBe(500);
  });

  it('hashes to something the token cannot be read out of', () => {
    const token = generateToken();
    const digest = hashToken(token);

    expect(digest).toHaveLength(64);
    expect(digest).not.toContain(token);
    expect(hashToken(token)).toBe(digest);
  });
});

describe('safeEqual', () => {
  it('matches identical strings and rejects everything else', () => {
    expect(safeEqual('abc123', 'abc123')).toBe(true);
    expect(safeEqual('abc123', 'abc124')).toBe(false);
    expect(safeEqual('abc', 'abc123')).toBe(false);
    expect(safeEqual('', '')).toBe(true);
  });
});
