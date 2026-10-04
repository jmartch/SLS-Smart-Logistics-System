import { ResolveSessionService } from './resolve-session.service';
import type { SessionRepository } from '../domain/session.repository';
import { hashSessionToken } from '../domain/session-token';
import { SESSION_TTL_MS } from '../domain/session-policy';

function fakeSessions(
  found: Awaited<ReturnType<SessionRepository['findActiveByTokenHash']>>,
): SessionRepository {
  return {
    create: jest.fn(),
    findActiveByTokenHash: jest.fn().mockResolvedValue(found),
    touch: jest.fn(),
    revoke: jest.fn(),
    revokeAllForUser: jest.fn(),
  };
}

describe('ResolveSessionService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('resolves a TENANT_USER session and loads its permissions from the given tenantId/userId', async () => {
    const sessions = fakeSessions({
      id: 'session-1',
      actor: {
        actorType: 'TENANT_USER',
        tenantId: 'tenant-a',
        userId: 'user-a',
      },
      expiresAt: new Date(),
    });
    const loadPermissions = jest.fn().mockResolvedValue(['REGISTER_PACKAGES']);

    const actor = await new ResolveSessionService(sessions).resolve(
      'raw-token',
      loadPermissions,
    );

    expect(loadPermissions).toHaveBeenCalledWith('tenant-a', 'user-a');
    expect(actor).toEqual({
      kind: 'TENANT_USER',
      tenantId: 'tenant-a',
      userId: 'user-a',
      permissions: new Set(['REGISTER_PACKAGES']),
    });
  });

  it('resolves a PLATFORM_ADMIN session without calling loadPermissions', async () => {
    const sessions = fakeSessions({
      id: 'session-2',
      actor: { actorType: 'PLATFORM_ADMIN', platformAdminId: 'admin-a' },
      expiresAt: new Date(),
    });
    const loadPermissions = jest.fn();

    const actor = await new ResolveSessionService(sessions).resolve(
      'raw-token',
      loadPermissions,
    );

    expect(loadPermissions).not.toHaveBeenCalled();
    expect(actor).toEqual({
      kind: 'PLATFORM_ADMIN',
      platformAdminId: 'admin-a',
    });
  });

  it('returns null for an expired or unknown token and never touches a session', async () => {
    const sessions = fakeSessions(null);
    const loadPermissions = jest.fn();

    const actor = await new ResolveSessionService(sessions).resolve(
      'raw-token',
      loadPermissions,
    );

    expect(actor).toBeNull();
    expect(sessions.touch).not.toHaveBeenCalled();
    expect(loadPermissions).not.toHaveBeenCalled();
  });

  it('looks the session up by the token hash, never the raw token', async () => {
    const sessions = fakeSessions(null);

    await new ResolveSessionService(sessions).resolve('raw-token', jest.fn());

    expect(sessions.findActiveByTokenHash).toHaveBeenCalledWith(
      hashSessionToken('raw-token'),
    );
  });

  it('slides the expiry to now + 12h exactly once for a valid session', async () => {
    const now = new Date('2026-10-04T12:00:00.000Z');
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(now);
    const sessions = fakeSessions({
      id: 'session-1',
      actor: { actorType: 'PLATFORM_ADMIN', platformAdminId: 'admin-a' },
      expiresAt: new Date(now.getTime() + 60_000),
    });

    await new ResolveSessionService(sessions).resolve('raw-token', jest.fn());

    expect(sessions.touch).toHaveBeenCalledTimes(1);
    expect(sessions.touch).toHaveBeenCalledWith(
      'session-1',
      new Date(now.getTime() + SESSION_TTL_MS),
    );
  });
});
