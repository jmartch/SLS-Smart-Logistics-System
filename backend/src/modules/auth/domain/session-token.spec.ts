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

  it('never returns the raw token as the hash', () => {
    const { rawToken, tokenHash } = generateSessionToken();
    expect(tokenHash).not.toBe(rawToken);
  });
});
