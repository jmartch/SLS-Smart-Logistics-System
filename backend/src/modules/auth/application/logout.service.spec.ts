import { LogoutService } from './logout.service';
import type { SessionRepository } from '../domain/session.repository';
import { hashSessionToken } from '../domain/session-token';

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

    await new LogoutService(sessions).logout('raw-token');

    expect(sessions.findActiveByTokenHash).toHaveBeenCalledWith(
      hashSessionToken('raw-token'),
    );
    expect(sessions.revoke).toHaveBeenCalledTimes(1);
    expect(sessions.revoke).toHaveBeenCalledWith('session-1');
  });

  it('does nothing for an unknown or already inactive token', async () => {
    const sessions = fakeSessions(null);

    await expect(
      new LogoutService(sessions).logout('unknown-token'),
    ).resolves.toBeUndefined();

    expect(sessions.revoke).not.toHaveBeenCalled();
  });
});
