import { LoginPlatformAdminService } from './login-platform-admin.service';
import type {
  PlatformAdminForLogin,
  PlatformAdminRepository,
} from '../domain/platform-admin.repository';
import type { SessionRepository } from '../../auth/domain/session.repository';
import * as passwordHasher from '../../auth/domain/password-hasher';
import { hashPassword } from '../../auth/domain/password-hasher';
import { hashSessionToken } from '../../auth/domain/session-token';
import { SESSION_TTL_MS } from '../../auth/domain/session-policy';

function fakeSessionRepository(): SessionRepository {
  return {
    create: jest.fn().mockResolvedValue({
      id: 'session-1',
      actor: {} as never,
      expiresAt: new Date(),
    }),
    findActiveByTokenHash: jest.fn(),
    touch: jest.fn(),
    revoke: jest.fn(),
    revokeAllForUser: jest.fn(),
  };
}

function repositoryWith(
  admin: PlatformAdminForLogin | null,
): PlatformAdminRepository {
  return { findByEmail: jest.fn().mockResolvedValue(admin) };
}

function adminWith(
  passwordHash: string,
  status: PlatformAdminForLogin['status'] = 'ACTIVE',
): PlatformAdminForLogin {
  return { id: 'admin-1', passwordHash, status };
}

describe('LoginPlatformAdminService', () => {
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await hashPassword('super secret');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('logs in a platform admin with correct credentials', async () => {
    const sessions = fakeSessionRepository();

    const result = await new LoginPlatformAdminService(
      repositoryWith(adminWith(passwordHash)),
      sessions,
    ).login({ email: 'root@sls.local', password: 'super secret' });

    expect(result.kind).toBe('OK');
    expect(sessions.create).toHaveBeenCalledTimes(1);
  });

  it('rejects an unknown email without revealing that it does not exist', async () => {
    const sessions = fakeSessionRepository();

    const result = await new LoginPlatformAdminService(
      repositoryWith(null),
      sessions,
    ).login({ email: 'nobody@sls.local', password: 'anything' });

    expect(result).toEqual({ kind: 'INVALID_CREDENTIALS' });
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it('rejects a wrong password with the same generic failure and creates no session', async () => {
    const sessions = fakeSessionRepository();

    const result = await new LoginPlatformAdminService(
      repositoryWith(adminWith(passwordHash)),
      sessions,
    ).login({ email: 'root@sls.local', password: 'wrong' });

    expect(result).toEqual({ kind: 'INVALID_CREDENTIALS' });
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it.each(['INACTIVE', 'SUSPENDED'] as const)(
    'rejects a %s admin even with the correct password and creates no session',
    async (status) => {
      const sessions = fakeSessionRepository();

      const result = await new LoginPlatformAdminService(
        repositoryWith(adminWith(passwordHash, status)),
        sessions,
      ).login({ email: 'root@sls.local', password: 'super secret' });

      expect(result).toEqual({ kind: 'INVALID_CREDENTIALS' });
      expect(sessions.create).not.toHaveBeenCalled();
    },
  );

  it('trims and lowercases the email before the lookup, but not the password', async () => {
    const repository = repositoryWith(adminWith(passwordHash));
    const verify = jest.spyOn(passwordHasher, 'verifyPassword');

    const result = await new LoginPlatformAdminService(
      repository,
      fakeSessionRepository(),
    ).login({ email: '  Root@SLS.Local ', password: 'super secret' });

    expect(result.kind).toBe('OK');
    expect(repository.findByEmail).toHaveBeenCalledWith('root@sls.local');
    expect(verify).toHaveBeenCalledWith(passwordHash, 'super secret');
  });

  it('creates a PLATFORM_ADMIN session storing only the token hash, with a 12h expiry', async () => {
    const now = new Date('2026-10-04T12:00:00.000Z');
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(now);
    const sessions = fakeSessionRepository();

    const result = await new LoginPlatformAdminService(
      repositoryWith(adminWith(passwordHash)),
      sessions,
    ).login({ email: 'root@sls.local', password: 'super secret' });

    expect(result.kind).toBe('OK');
    if (result.kind !== 'OK') return;
    const expectedExpiry = new Date(now.getTime() + SESSION_TTL_MS);
    expect(result.expiresAt).toEqual(expectedExpiry);
    expect(sessions.create).toHaveBeenCalledTimes(1);
    expect(sessions.create).toHaveBeenCalledWith(
      { actorType: 'PLATFORM_ADMIN', platformAdminId: 'admin-1' },
      expect.any(String),
      expectedExpiry,
    );
    const storedHash = (sessions.create as jest.Mock).mock
      .calls[0][1] as string;
    expect(storedHash).not.toBe(result.rawToken);
    expect(hashSessionToken(result.rawToken)).toBe(storedHash);
  });

  describe('timing-safe failure paths', () => {
    // Every failure path must cost exactly one argon2 verification so response
    // time does not reveal whether an admin email exists or is active.
    it('verifies against a dummy hash for an unknown email', async () => {
      const verify = jest.spyOn(passwordHasher, 'verifyPassword');

      await new LoginPlatformAdminService(
        repositoryWith(null),
        fakeSessionRepository(),
      ).login({ email: 'nobody@sls.local', password: 'whatever' });

      expect(verify).toHaveBeenCalledTimes(1);
      expect(verify).toHaveBeenCalledWith(
        expect.stringMatching(/^\$argon2/),
        'whatever',
      );
      expect(verify.mock.calls[0][0]).not.toBe(passwordHash);
    });

    it('verifies against a dummy hash for an INACTIVE and a SUSPENDED admin', async () => {
      const verify = jest.spyOn(passwordHasher, 'verifyPassword');

      for (const status of ['INACTIVE', 'SUSPENDED'] as const) {
        await new LoginPlatformAdminService(
          repositoryWith(adminWith(passwordHash, status)),
          fakeSessionRepository(),
        ).login({ email: 'root@sls.local', password: 'super secret' });
      }

      expect(verify).toHaveBeenCalledTimes(2);
      for (const call of verify.mock.calls) {
        expect(call[0]).not.toBe(passwordHash);
      }
    });

    it('verifies exactly once for a wrong password against the real hash', async () => {
      const verify = jest.spyOn(passwordHasher, 'verifyPassword');

      await new LoginPlatformAdminService(
        repositoryWith(adminWith(passwordHash)),
        fakeSessionRepository(),
      ).login({ email: 'root@sls.local', password: 'wrong' });

      expect(verify).toHaveBeenCalledTimes(1);
      expect(verify).toHaveBeenCalledWith(passwordHash, 'wrong');
    });
  });
});
