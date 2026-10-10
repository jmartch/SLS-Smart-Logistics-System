import { createHash, randomBytes } from 'node:crypto';

export interface GeneratedSessionToken {
  readonly rawToken: string;
  readonly tokenHash: string;
}

export function generateSessionToken(): GeneratedSessionToken {
  const rawToken = randomBytes(32).toString('base64url');
  return { rawToken, tokenHash: hashSessionToken(rawToken) };
}

export function hashSessionToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}
