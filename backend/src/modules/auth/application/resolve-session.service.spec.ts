import {
  ResolveSessionService,
  type SessionActorLoaders,
} from './resolve-session.service';
import type { SessionRepository } from '../domain/session.repository';
import { hashSessionToken } from '../domain/session-token';
import { SESSION_TTL_MS } from '../domain/session-policy';

// The mocks are kept as standalone functions so assertions never detach a
// method from the repository object.
function fakeSessions(
  found: Awaited<ReturnType<SessionRepository['findActiveByTokenHash']>>,
) {
  const mocks = {
    findActiveByTokenHash: jest.fn().mockResolvedValue(found),
    touch: jest.fn().mockResolvedValue(undefined),
    revoke: jest.fn().mockResolvedValue(undefined),
  };
  const repository: SessionRepository = {
    create: jest.fn(),
    revokeAllForUser: jest.fn(),
    ...mocks,
  };

  return { repository, mocks };
}

function loaders(
  options: {
    permissions?: readonly string[] | null;
    platformAdminActive?: boolean;
  } = {},
) {
  const loadTenantUserPermissions = jest
    .fn()
    .mockResolvedValue(
      options.permissions === undefined ? [] : options.permissions,
    );
  const isPlatformAdminActive = jest
    .fn()
    .mockResolvedValue(options.platformAdminActive ?? true);
  const value: SessionActorLoaders = {
    loadTenantUserPermissions,
    isPlatformAdminActive,
  };

  return { value, loadTenantUserPermissions, isPlatformAdminActive };
}

const tenantSession = {
  id: 'session-1',
  actor: {
    actorType: 'TENANT_USER' as const,
    tenantId: 'tenant-a',
    userId: 'user-a',
  },
  expiresAt: new Date(),
};

const platformSession = {
  id: 'session-2',
  actor: {
    actorType: 'PLATFORM_ADMIN' as const,
    platformAdminId: 'admin-a',
  },
  expiresAt: new Date(),
};

describe('ResolveSessionService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('resolves a TENANT_USER session and loads its permissions from the given tenantId/userId', async () => {
    const sessions = fakeSessions(tenantSession);
    const { value, loadTenantUserPermissions, isPlatformAdminActive } = loaders(
      { permissions: ['REGISTER_PACKAGES'] },
    );

    const actor = await new ResolveSessionService(sessions.repository).resolve(
      'raw-token',
      value,
    );

    expect(loadTenantUserPermissions).toHaveBeenCalledWith(
      'tenant-a',
      'user-a',
    );
    expect(isPlatformAdminActive).not.toHaveBeenCalled();
    expect(actor).toEqual({
      kind: 'TENANT_USER',
      tenantId: 'tenant-a',
      userId: 'user-a',
      permissions: new Set(['REGISTER_PACKAGES']),
    });
  });

  it('still resolves an ACTIVE tenant user without roles, with no permissions', async () => {
    const sessions = fakeSessions(tenantSession);

    const actor = await new ResolveSessionService(sessions.repository).resolve(
      'raw-token',
      loaders({ permissions: [] }).value,
    );

    expect(actor).toEqual({
      kind: 'TENANT_USER',
      tenantId: 'tenant-a',
      userId: 'user-a',
      permissions: new Set(),
    });
    expect(sessions.mocks.touch).toHaveBeenCalledTimes(1);
    expect(sessions.mocks.revoke).not.toHaveBeenCalled();
  });

  it('rejects a tenant user who is no longer ACTIVE (or whose tenant is not), without extending the session', async () => {
    // The loader answers null for an inactive/suspended user, a suspended
    // tenant, or a user that no longer exists in the session's tenant.
    const sessions = fakeSessions(tenantSession);

    const actor = await new ResolveSessionService(sessions.repository).resolve(
      'raw-token',
      loaders({ permissions: null }).value,
    );

    expect(actor).toBeNull();
    expect(sessions.mocks.touch).not.toHaveBeenCalled();
  });

  it('revokes the stale session of a tenant user who is no longer ACTIVE', async () => {
    const sessions = fakeSessions(tenantSession);

    await new ResolveSessionService(sessions.repository).resolve(
      'raw-token',
      loaders({ permissions: null }).value,
    );

    expect(sessions.mocks.revoke).toHaveBeenCalledWith('session-1');
  });

  it('resolves an ACTIVE PLATFORM_ADMIN session without loading tenant permissions', async () => {
    const sessions = fakeSessions(platformSession);
    const { value, loadTenantUserPermissions, isPlatformAdminActive } = loaders(
      { platformAdminActive: true },
    );

    const actor = await new ResolveSessionService(sessions.repository).resolve(
      'raw-token',
      value,
    );

    expect(isPlatformAdminActive).toHaveBeenCalledWith('admin-a');
    expect(loadTenantUserPermissions).not.toHaveBeenCalled();
    expect(actor).toEqual({
      kind: 'PLATFORM_ADMIN',
      platformAdminId: 'admin-a',
    });
  });

  it('rejects and revokes the session of a platform admin who is no longer ACTIVE, without extending it', async () => {
    const sessions = fakeSessions(platformSession);

    const actor = await new ResolveSessionService(sessions.repository).resolve(
      'raw-token',
      loaders({ platformAdminActive: false }).value,
    );

    expect(actor).toBeNull();
    expect(sessions.mocks.touch).not.toHaveBeenCalled();
    expect(sessions.mocks.revoke).toHaveBeenCalledWith('session-2');
  });

  it('still rejects an inactive actor when revoking its session fails', async () => {
    const sessions = fakeSessions(platformSession);
    sessions.mocks.revoke.mockRejectedValue(new Error('db down'));

    await expect(
      new ResolveSessionService(sessions.repository).resolve(
        'raw-token',
        loaders({ platformAdminActive: false }).value,
      ),
    ).resolves.toBeNull();
  });

  it('propagates a failure of the activity check instead of resolving the actor', async () => {
    const sessions = fakeSessions(tenantSession);
    const { value, loadTenantUserPermissions } = loaders();
    const failure = new Error('db down');
    loadTenantUserPermissions.mockRejectedValue(failure);

    await expect(
      new ResolveSessionService(sessions.repository).resolve(
        'raw-token',
        value,
      ),
    ).rejects.toBe(failure);
    expect(sessions.mocks.touch).not.toHaveBeenCalled();
  });

  it('returns null for an expired or unknown token and never touches a session', async () => {
    const sessions = fakeSessions(null);
    const { value, loadTenantUserPermissions, isPlatformAdminActive } =
      loaders();

    const actor = await new ResolveSessionService(sessions.repository).resolve(
      'raw-token',
      value,
    );

    expect(actor).toBeNull();
    expect(sessions.mocks.touch).not.toHaveBeenCalled();
    expect(sessions.mocks.revoke).not.toHaveBeenCalled();
    expect(loadTenantUserPermissions).not.toHaveBeenCalled();
    expect(isPlatformAdminActive).not.toHaveBeenCalled();
  });

  it('looks the session up by the token hash, never the raw token', async () => {
    const sessions = fakeSessions(null);

    await new ResolveSessionService(sessions.repository).resolve(
      'raw-token',
      loaders().value,
    );

    expect(sessions.mocks.findActiveByTokenHash).toHaveBeenCalledWith(
      hashSessionToken('raw-token'),
    );
  });

  it.each([
    ['platform admin', platformSession],
    ['tenant user', tenantSession],
  ])(
    'slides the expiry to now + 12h exactly once for a valid %s session',
    async (_label, found) => {
      const now = new Date('2026-10-04T12:00:00.000Z');
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
      jest.setSystemTime(now);
      const sessions = fakeSessions({
        ...found,
        expiresAt: new Date(now.getTime() + 60_000),
      });

      await new ResolveSessionService(sessions.repository).resolve(
        'raw-token',
        loaders().value,
      );

      expect(sessions.mocks.touch).toHaveBeenCalledTimes(1);
      expect(sessions.mocks.touch).toHaveBeenCalledWith(
        found.id,
        new Date(now.getTime() + SESSION_TTL_MS),
      );
    },
  );
});
