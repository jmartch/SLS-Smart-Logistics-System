import * as argon2 from 'argon2';

// Parameters are written out on purpose: the library defaults can change on an
// upgrade and silently weaken (or slow) new hashes. Hashes already stored carry
// their own parameters, so they keep verifying regardless of these values.
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 1 << 16, // 64 MiB
  timeCost: 3,
  parallelism: 4,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTIONS);
}

export async function verifyPassword(
  hash: string,
  plain: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    // A malformed stored hash must read as a failed credential, not a crash.
    return false;
  }
}
