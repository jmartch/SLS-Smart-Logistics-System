import { hashPassword, verifyPassword } from './password-hasher';

// Login failure paths that skip the real hash still pay for one argon2
// verification against this throwaway hash, so response time does not reveal
// whether an account exists. Computed once, on first use.
let dummyPasswordHash: Promise<string> | undefined;

function getDummyPasswordHash(): Promise<string> {
  if (!dummyPasswordHash) {
    dummyPasswordHash = hashPassword(
      'sls-dummy-password-for-timing-parity',
    ).catch((error: unknown) => {
      // Do not cache a rejection: a transient failure must not break every
      // later failed login.
      dummyPasswordHash = undefined;
      throw error;
    });
  }
  return dummyPasswordHash;
}

/** Spends the cost of one real verification; the outcome is deliberately ignored. */
export async function verifyAgainstDummyHash(plain: string): Promise<void> {
  await verifyPassword(await getDummyPasswordHash(), plain);
}
