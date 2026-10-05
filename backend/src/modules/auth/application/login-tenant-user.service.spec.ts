import { LoginTenantUserService } from './login-tenant-user.service';
import type { SessionRepository } from '../domain/session.repository';
import type {
  TenantUserLookupRepository,
  UserForLogin,
} from '../domain/tenant-user-lookup.repository';
import * as passwordHasher from '../domain/password-hasher';
import { hashPassword } from '../domain/password-hasher';
import { hashSessionToken } from '../domain/session-token';
import { SESSION_TTL_MS } from '../domain/session-policy';

// The mocks are kept as standalone functions so assertions never detach a
// method from the repository object.
function fakeSessionRepository() {
  const create = jest
    .fn<
      ReturnType<SessionRepository['create']>,
      Parameters<SessionRepository['create']>
    >()
    .mockResolvedValue({
      id: 'session-1',
      actor: {} as never,
      expiresAt: new Date(),
    });
  const repository: SessionRepository = {
    create,
    findActiveByTokenHash: jest.fn(),
    touch: jest.fn(),
    revoke: jest.fn(),
    revokeAllForUser: jest.fn(),
  };

  return { repository, create };
}

function lookupWith(
  tenant: { id: string; status: 'ACTIVE' | 'SUSPENDED' } | null,
  user: UserForLogin | null,
) {
  const findTenantBySlug = jest.fn().mockResolvedValue(tenant);
  const findUserForLogin = jest.fn().mockResolvedValue(user);
  const repository: TenantUserLookupRepository = {
    findTenantBySlug,
    findUserForLogin,
    findPermissionsForUser: jest.fn().mockResolvedValue([]),
    findUserProfile: jest.fn(),
  };

  return { repository, findTenantBySlug, findUserForLogin };
}

function userWith(
  passwordHash: string,
  status: UserForLogin['status'] = 'ACTIVE',
): UserForLogin {
  return {
    id: 'user-a',
    tenantId: 'tenant-a',
    passwordHash,
    status,
    permissions: ['REGISTER_PACKAGES'],
  };
}

describe('LoginTenantUserService', () => {
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await hashPassword('correct password');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('logs in with correct slug, email, and password', async () => {
    const lookup = lookupWith(
      { id: 'tenant-a', status: 'ACTIVE' },
      userWith(passwordHash),
    );
    const sessions = fakeSessionRepository();
    const service = new LoginTenantUserService(
      lookup.repository,
      sessions.repository,
    );

    const result = await service.login({
      slug: 'acme',
      email: 'user@acme.test',
      password: 'correct password',
    });

    expect(result.kind).toBe('OK');
    expect(sessions.create).toHaveBeenCalled();
  });

  it('returns the same generic failure for wrong password, unknown user, unknown slug, and suspended user', async () => {
    const wrongPassword = await new LoginTenantUserService(
      lookupWith({ id: 'tenant-a', status: 'ACTIVE' }, userWith(passwordHash))
        .repository,
      fakeSessionRepository().repository,
    ).login({ slug: 'acme', email: 'user@acme.test', password: 'wrong' });

    const unknownSlug = await new LoginTenantUserService(
      lookupWith(null, null).repository,
      fakeSessionRepository().repository,
    ).login({
      slug: 'nope',
      email: 'user@acme.test',
      password: 'correct password',
    });

    const unknownUser = await new LoginTenantUserService(
      lookupWith({ id: 'tenant-a', status: 'ACTIVE' }, null).repository,
      fakeSessionRepository().repository,
    ).login({
      slug: 'acme',
      email: 'ghost@acme.test',
      password: 'correct password',
    });

    const suspendedUser = await new LoginTenantUserService(
      lookupWith(
        { id: 'tenant-a', status: 'ACTIVE' },
        userWith(passwordHash, 'SUSPENDED'),
      ).repository,
      fakeSessionRepository().repository,
    ).login({
      slug: 'acme',
      email: 'user@acme.test',
      password: 'correct password',
    });

    expect(wrongPassword).toEqual({ kind: 'INVALID_CREDENTIALS' });
    expect(unknownSlug).toEqual({ kind: 'INVALID_CREDENTIALS' });
    expect(unknownUser).toEqual({ kind: 'INVALID_CREDENTIALS' });
    expect(suspendedUser).toEqual({ kind: 'INVALID_CREDENTIALS' });
  });

  it('trims and lowercases slug and email before the lookups, but not the password', async () => {
    const lookup = lookupWith(
      { id: 'tenant-a', status: 'ACTIVE' },
      userWith(passwordHash),
    );
    const verify = jest.spyOn(passwordHasher, 'verifyPassword');
    const service = new LoginTenantUserService(
      lookup.repository,
      fakeSessionRepository().repository,
    );

    const result = await service.login({
      slug: '  AcMe ',
      email: ' User@Acme.TEST  ',
      password: 'correct password',
    });

    expect(result.kind).toBe('OK');
    expect(lookup.findTenantBySlug).toHaveBeenCalledWith('acme');
    expect(lookup.findUserForLogin).toHaveBeenCalledWith(
      'tenant-a',
      'user@acme.test',
    );
    expect(verify).toHaveBeenCalledWith(passwordHash, 'correct password');
  });

  it('does not create a session for a SUSPENDED tenant', async () => {
    const lookup = lookupWith(
      { id: 'tenant-a', status: 'SUSPENDED' },
      userWith(passwordHash),
    );
    const sessions = fakeSessionRepository();

    const result = await new LoginTenantUserService(
      lookup.repository,
      sessions.repository,
    ).login({
      slug: 'acme',
      email: 'user@acme.test',
      password: 'correct password',
    });

    expect(result).toEqual({ kind: 'INVALID_CREDENTIALS' });
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it('does not look the user up when the tenant is unknown or SUSPENDED', async () => {
    const login = (lookup: ReturnType<typeof lookupWith>) =>
      new LoginTenantUserService(
        lookup.repository,
        fakeSessionRepository().repository,
      ).login({
        slug: 'acme',
        email: 'user@acme.test',
        password: 'correct password',
      });

    const unknownTenant = lookupWith(null, userWith(passwordHash));
    const suspendedTenant = lookupWith(
      { id: 'tenant-a', status: 'SUSPENDED' },
      userWith(passwordHash),
    );

    await login(unknownTenant);
    await login(suspendedTenant);

    expect(unknownTenant.findUserForLogin).not.toHaveBeenCalled();
    expect(suspendedTenant.findUserForLogin).not.toHaveBeenCalled();
  });

  it('does not create a session for an INACTIVE user', async () => {
    const lookup = lookupWith(
      { id: 'tenant-a', status: 'ACTIVE' },
      userWith(passwordHash, 'INACTIVE'),
    );
    const sessions = fakeSessionRepository();

    const result = await new LoginTenantUserService(
      lookup.repository,
      sessions.repository,
    ).login({
      slug: 'acme',
      email: 'user@acme.test',
      password: 'correct password',
    });

    expect(result).toEqual({ kind: 'INVALID_CREDENTIALS' });
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it('looks the user up in the resolved tenant and takes the session tenant from the user row', async () => {
    // Distinct ids: the lookup is scoped by the tenant resolved from the slug,
    // while the session must carry the tenant stored on the user row.
    const lookup = lookupWith(
      { id: 'tenant-from-slug', status: 'ACTIVE' },
      { ...userWith(passwordHash), tenantId: 'tenant-from-user-row' },
    );
    const sessions = fakeSessionRepository();

    const result = await new LoginTenantUserService(
      lookup.repository,
      sessions.repository,
    ).login({
      slug: 'acme',
      email: 'user@acme.test',
      password: 'correct password',
    });

    expect(result.kind).toBe('OK');
    expect(lookup.findUserForLogin).toHaveBeenCalledWith(
      'tenant-from-slug',
      'user@acme.test',
    );
    expect(sessions.create).toHaveBeenCalledWith(
      {
        actorType: 'TENANT_USER',
        tenantId: 'tenant-from-user-row',
        userId: 'user-a',
      },
      expect.any(String),
      expect.any(Date),
    );
  });

  it('creates a TENANT_USER session storing only the token hash, with a 12h expiry', async () => {
    const now = new Date('2026-10-04T12:00:00.000Z');
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(now);
    const lookup = lookupWith(
      { id: 'tenant-a', status: 'ACTIVE' },
      userWith(passwordHash),
    );
    const sessions = fakeSessionRepository();

    const result = await new LoginTenantUserService(
      lookup.repository,
      sessions.repository,
    ).login({
      slug: 'acme',
      email: 'user@acme.test',
      password: 'correct password',
    });

    expect(result.kind).toBe('OK');
    if (result.kind !== 'OK') return;
    const expectedExpiry = new Date(now.getTime() + SESSION_TTL_MS);
    expect(SESSION_TTL_MS).toBe(12 * 60 * 60 * 1000);
    expect(result.expiresAt).toEqual(expectedExpiry);
    expect(sessions.create).toHaveBeenCalledTimes(1);
    expect(sessions.create).toHaveBeenCalledWith(
      { actorType: 'TENANT_USER', tenantId: 'tenant-a', userId: 'user-a' },
      expect.any(String),
      expectedExpiry,
    );
    const storedHash = String(sessions.create.mock.calls[0][1]);
    expect(storedHash).not.toBe(result.rawToken);
    expect(hashSessionToken(result.rawToken)).toBe(storedHash);
  });

  describe('timing-safe failure paths', () => {
    // Every failure path must cost one argon2 verification so response time
    // does not reveal whether a slug or email exists.
    it('verifies against a dummy hash for an unknown slug', async () => {
      const verify = jest.spyOn(passwordHasher, 'verifyPassword');

      await new LoginTenantUserService(
        lookupWith(null, null).repository,
        fakeSessionRepository().repository,
      ).login({ slug: 'nope', email: 'x@acme.test', password: 'whatever' });

      expect(verify).toHaveBeenCalledTimes(1);
      expect(verify).toHaveBeenCalledWith(
        expect.stringMatching(/^\$argon2/),
        'whatever',
      );
      expect(verify.mock.calls[0][0]).not.toBe(passwordHash);
    });

    it('verifies against a dummy hash for a SUSPENDED tenant, an unknown user, and a non-ACTIVE user', async () => {
      const verify = jest.spyOn(passwordHasher, 'verifyPassword');
      const login = (lookup: ReturnType<typeof lookupWith>) =>
        new LoginTenantUserService(
          lookup.repository,
          fakeSessionRepository().repository,
        ).login({
          slug: 'acme',
          email: 'user@acme.test',
          password: 'correct password',
        });

      await login(
        lookupWith(
          { id: 'tenant-a', status: 'SUSPENDED' },
          userWith(passwordHash),
        ),
      );
      await login(lookupWith({ id: 'tenant-a', status: 'ACTIVE' }, null));
      await login(
        lookupWith(
          { id: 'tenant-a', status: 'ACTIVE' },
          userWith(passwordHash, 'INACTIVE'),
        ),
      );

      expect(verify).toHaveBeenCalledTimes(3);
      for (const call of verify.mock.calls) {
        expect(call[0]).not.toBe(passwordHash);
        expect(call[0]).toMatch(/^\$argon2/);
      }
    });

    it('verifies exactly once for a wrong password against the real hash', async () => {
      const verify = jest.spyOn(passwordHasher, 'verifyPassword');

      await new LoginTenantUserService(
        lookupWith({ id: 'tenant-a', status: 'ACTIVE' }, userWith(passwordHash))
          .repository,
        fakeSessionRepository().repository,
      ).login({ slug: 'acme', email: 'user@acme.test', password: 'wrong' });

      expect(verify).toHaveBeenCalledTimes(1);
      expect(verify).toHaveBeenCalledWith(passwordHash, 'wrong');
    });
  });
});
