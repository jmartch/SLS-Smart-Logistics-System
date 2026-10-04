import { Injectable } from '@nestjs/common';
import { SessionRepository } from '../domain/session.repository';
import { hashSessionToken } from '../domain/session-token';
import { SESSION_TTL_MS } from '../domain/session-policy';
import type { ActorContext } from '../../../shared/application/actor-context';

export type PermissionLoader = (
  tenantId: string,
  userId: string,
) => Promise<readonly string[]>;

@Injectable()
export class ResolveSessionService {
  constructor(private readonly sessions: SessionRepository) {}

  async resolve(
    rawToken: string,
    loadPermissions: PermissionLoader,
  ): Promise<ActorContext | null> {
    const session = await this.sessions.findActiveByTokenHash(
      hashSessionToken(rawToken),
    );

    if (!session) {
      return null;
    }

    // touch() does not check expiry, so it must only follow a successful find.
    await this.sessions.touch(
      session.id,
      new Date(Date.now() + SESSION_TTL_MS),
    );

    if (session.actor.actorType === 'PLATFORM_ADMIN') {
      return {
        kind: 'PLATFORM_ADMIN',
        platformAdminId: session.actor.platformAdminId,
      };
    }

    const permissions = await loadPermissions(
      session.actor.tenantId,
      session.actor.userId,
    );

    return {
      kind: 'TENANT_USER',
      tenantId: session.actor.tenantId,
      userId: session.actor.userId,
      permissions: new Set(permissions),
    };
  }
}
