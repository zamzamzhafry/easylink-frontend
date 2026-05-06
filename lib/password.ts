import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 12;
const BCRYPT_PREFIX = '$2a$';

function isBcryptHash(value: string): boolean {
  return value.startsWith(BCRYPT_PREFIX) || value.startsWith('$2b$') || value.startsWith('$2y$');
}

export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, BCRYPT_ROUNDS);
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

  if (!stored && !typed) return { valid: true, needsRehash: false };
  if (!stored || !typed) return { valid: false, needsRehash: false };

  if (isBcryptHash(stored)) {
    const valid = await bcrypt.compare(typed, stored);
    return { valid, needsRehash: false };
  }

  // Legacy plaintext comparison (migration path)
  const valid = stored === typed;
  return { valid, needsRehash: valid };
}
