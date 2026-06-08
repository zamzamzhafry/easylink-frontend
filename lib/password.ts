import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 12;
const BCRYPT_PREFIX = '$2a$';

function isBcryptHash(value: string): boolean {
  return value.startsWith(BCRYPT_PREFIX) || value.startsWith('$2b$') || value.startsWith('$2y$');
}

export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, BCRYPT_ROUNDS);
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) {
    return false;
  }

  // Equal-length comparison avoids crypto.timingSafeEqual length mismatch exception.
  return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

/**
 * Migration-safe password verification.
 * Supports both bcrypt hashes and legacy plaintext comparison.
 * When a plaintext match is found, caller should re-hash and store.
 */
export async function verifyPassword(
  storedHash: string | null | undefined,
  input: string
): Promise<{ valid: boolean; needsRehash: boolean }> {
  const stored = String(storedHash ?? '').trim();
  const typed = String(input ?? '').trim();

  if (!stored || !typed) {
    return { valid: false, needsRehash: false };
  }

  if (isBcryptHash(stored)) {
    const valid = await bcrypt.compare(typed, stored);
    return { valid, needsRehash: false };
  }

  const valid = timingSafeEqual(stored, typed);
  return { valid, needsRehash: valid };
}
