import type * as PasswordHasher from './password-hasher';
import type * as DummyPasswordVerification from './dummy-password-verification';

// The helper caches its dummy hash at module level, so each test loads fresh
// copies of both modules to start from an empty cache.
function loadModules(): {
  hasher: typeof PasswordHasher;
  helper: typeof DummyPasswordVerification;
} {
  jest.resetModules();
  const hasher = jest.requireActual<typeof PasswordHasher>('./password-hasher');
  const helper = jest.requireActual<typeof DummyPasswordVerification>(
    './dummy-password-verification',
  );
  return { hasher, helper };
}

describe('verifyAgainstDummyHash', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('computes the dummy argon2 hash once and verifies the password against it each time', async () => {
    const { hasher, helper } = loadModules();
    const hash = jest.spyOn(hasher, 'hashPassword');
    const verify = jest.spyOn(hasher, 'verifyPassword');

    await helper.verifyAgainstDummyHash('first');
    await helper.verifyAgainstDummyHash('second');

    expect(hash).toHaveBeenCalledTimes(1);
    expect(verify).toHaveBeenCalledTimes(2);
    expect(verify).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/^\$argon2/),
      'first',
    );
    expect(verify).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/^\$argon2/),
      'second',
    );
  });

  it('does not cache a failed hash computation, so a later call can recover', async () => {
    const { hasher, helper } = loadModules();
    const hash = jest
      .spyOn(hasher, 'hashPassword')
      .mockRejectedValueOnce(new Error('hash failed'));

    await expect(helper.verifyAgainstDummyHash('x')).rejects.toThrow(
      'hash failed',
    );
    await expect(helper.verifyAgainstDummyHash('x')).resolves.toBeUndefined();

    expect(hash).toHaveBeenCalledTimes(2);
  });
});
