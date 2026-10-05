import * as argon2 from 'argon2';
import { hashPassword, verifyPassword } from './password-hasher';

describe('password-hasher', () => {
  it('verifies a correct password against its hash', async () => {
    const hash = await hashPassword('correct horse battery staple');
    await expect(
      verifyPassword(hash, 'correct horse battery staple'),
    ).resolves.toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    await expect(verifyPassword(hash, 'wrong password')).resolves.toBe(false);
  });

  it('hashes with argon2id and the pinned cost parameters', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    // The PHC string lists the parameters in the library's own order.
    expect(hash).toMatch(/[,$]m=65536[,$]/);
    expect(hash).toMatch(/[,$]t=3[,$]/);
    expect(hash).toMatch(/[,$]p=4[,$]/);
  });

  it('keeps verifying a hash produced with the library defaults', async () => {
    const legacy = await argon2.hash('correct horse battery staple');
    await expect(
      verifyPassword(legacy, 'correct horse battery staple'),
    ).resolves.toBe(true);
  });

  it('never stores the plaintext in the hash', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).not.toContain('correct horse battery staple');
  });
});
