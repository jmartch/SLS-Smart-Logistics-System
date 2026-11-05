import { HttpException, HttpStatus } from '@nestjs/common';
import { LoginRateLimiter } from './login-rate-limiter';

describe('LoginRateLimiter', () => {
  it('normalizes tenant and platform keys without distinguishing existing vs non-existing actors', () => {
    const limiter = new LoginRateLimiter({ maxAttempts: 3, windowMs: 60_000 });

    expect(
      limiter.forTenantLogin(' 127.0.0.1 ', '  Acme-Co ', ' User@Test.com '),
    ).toBe('tenant:127.0.0.1:acme-co:user@test.com');

    expect(limiter.forPlatformLogin(undefined, ' Admin@Platform.Test ')).toBe(
      'platform:unknown:admin@platform.test',
    );
  });

  it('allows attempts below maxAttempts and rejects with 429 TOO_MANY_REQUESTS once the threshold is reached', () => {
    const limiter = new LoginRateLimiter({ maxAttempts: 3, windowMs: 60_000 });
    const key = limiter.forTenantLogin('127.0.0.1', 'acme', 'user@acme.test');
    const now = 1_000_000;

    for (let i = 0; i < 3; i += 1) {
      expect(() => limiter.assertAllowed(key, { now })).not.toThrow();
      limiter.recordFailure(key, now);
    }

    const setHeader = jest.fn();
    let caught: unknown;
    try {
      limiter.assertAllowed(key, { now: now + 5_000, setHeader });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(HttpException);
    const httpError = caught as HttpException;
    expect(httpError.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(httpError.getResponse()).toEqual({
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many login attempts. Please try again later.',
        fields: null,
      },
    });
    expect(setHeader).toHaveBeenCalledWith('Retry-After', '55');
  });

  it('resets the failure bucket after a successful login', () => {
    const limiter = new LoginRateLimiter({ maxAttempts: 2, windowMs: 60_000 });
    const key = limiter.forPlatformLogin('127.0.0.1', 'admin@sls.test');
    const now = 2_000_000;

    limiter.recordFailure(key, now);
    limiter.reset(key);
    limiter.recordFailure(key, now + 100);

    expect(() => limiter.assertAllowed(key, { now: now + 200 })).not.toThrow();
  });

  it('unblocks the key once the rate-limit window expires', () => {
    const limiter = new LoginRateLimiter({ maxAttempts: 2, windowMs: 10_000 });
    const key = limiter.forTenantLogin('127.0.0.1', 'acme', 'user@acme.test');
    const now = 3_000_000;

    limiter.recordFailure(key, now);
    limiter.recordFailure(key, now + 100);

    expect(() => limiter.assertAllowed(key, { now: now + 5_000 })).toThrow(
      HttpException,
    );
    expect(() =>
      limiter.assertAllowed(key, { now: now + 10_001 }),
    ).not.toThrow();
  });
});
