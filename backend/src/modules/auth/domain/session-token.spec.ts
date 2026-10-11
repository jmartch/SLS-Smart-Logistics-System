import { generateSessionToken, hashSessionToken } from './session-token';

describe('session-token', () => {
  it('produces a raw token whose hash matches hashSessionToken', () => {
    const { rawToken, tokenHash } = generateSessionToken();
    expect(hashSessionToken(rawToken)).toBe(tokenHash);
  });

  it('generates a different token on every call', () => {
    const first = generateSessionToken();
    const second = generateSessionToken();
    expect(first.rawToken).not.toBe(second.rawToken);
  });

  it('encodes 32 random bytes as a 43-char base64url token', () => {
    const { rawToken } = generateSessionToken();
    expect(rawToken).toHaveLength(43);
    expect(rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('stores a SHA-256 hex digest as the token hash', () => {
    const { tokenHash } = generateSessionToken();
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('never returns the raw token as the hash', () => {
    const { rawToken, tokenHash } = generateSessionToken();
    expect(tokenHash).not.toBe(rawToken);
  });
});
