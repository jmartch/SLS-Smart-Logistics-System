import { LogoutService } from './logout.service';
import type { SessionRepository } from '../domain/session.repository';
import { hashSessionToken } from '../domain/session-token';

// The mocks are kept as standalone functions so assertions never detach a
// method from the repository object.
function fakeSessions(
  found: Awaited<ReturnType<SessionRepository['findActiveByTokenHash']>>,
) {
  const findActiveByTokenHash = jest.fn().mockResolvedValue(found);
  const revoke = jest.fn();
  const repository: SessionRepository = {
    create: jest.fn(),
    findActiveByTokenHash,
    touch: jest.fn(),
    revoke,
    revokeAllForUser: jest.fn(),
  };

  return { repository, findActiveByTokenHash, revoke };
}

describe('LogoutService', () => {
  it('revokes the session found by the token hash', async () => {
    const sessions = fakeSessions({
      id: 'session-1',
      actor: {
        actorType: 'TENANT_USER',
        tenantId: 'tenant-a',
        userId: 'user-a',
      },
      expiresAt: new Date(),
    });

    await new LogoutService(sessions.repository).logout('raw-token');

    expect(sessions.findActiveByTokenHash).toHaveBeenCalledWith(
      hashSessionToken('raw-token'),
    );
    expect(sessions.revoke).toHaveBeenCalledTimes(1);
    expect(sessions.revoke).toHaveBeenCalledWith('session-1');
  });

  it('does nothing for an unknown or already inactive token', async () => {
    const sessions = fakeSessions(null);

    await expect(
      new LogoutService(sessions.repository).logout('unknown-token'),
    ).resolves.toBeUndefined();

    expect(sessions.revoke).not.toHaveBeenCalled();
  });
});
