import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Two different one-way functions, for two different jobs.
 *
 * Passwords get Argon2id: deliberately slow and memory-hard, because the
 * attacker's advantage is guessing throughput. Tokens get SHA-256: they are
 * already 256 bits of randomness, so stretching them buys nothing and would
 * only make every request pay for it.
 */

/** OWASP's current baseline for Argon2id. */
const ARGON_OPTIONS = {
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  return argonHash(plain, ARGON_OPTIONS);
}

/**
 * Returns false rather than throwing on a malformed hash: a corrupt row should
 * read as "wrong password", not as a 500 that tells the caller something.
 */
export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argonVerify(hash, plain);
  } catch {
    return false;
  }
}

/** URL-safe, 256 bits. Used for session, verification and reset tokens. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** What goes in the database, so a dump never yields a usable token. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Constant-time compare for anything an attacker can submit repeatedly. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
