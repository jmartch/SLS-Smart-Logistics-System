import { Injectable, Logger } from '@nestjs/common';
import {
  SessionRepository,
  type SessionActor,
} from '../domain/session.repository';
import { hashSessionToken } from '../domain/session-token';
import { SESSION_TTL_MS } from '../domain/session-policy';
import type { ActorContext } from '../../../shared/application/actor-context';

// Permissions currently granted to a tenant user, or null when the actor may
// no longer act: the user is not ACTIVE, the tenant is not ACTIVE, or the
// user does not exist in that tenant. An empty list is a valid ACTIVE user
// without roles.
export type TenantUserPermissionLoader = (
  tenantId: string,
  userId: string,
) => Promise<readonly string[] | null>;

export type PlatformAdminActiveCheck = (
  platformAdminId: string,
) => Promise<boolean>;

// Supplied by the caller so the actor's current state is read fresh, on every
// request, from the identifiers stored in the session row only.
export interface SessionActorLoaders {
  readonly loadTenantUserPermissions: TenantUserPermissionLoader;
  readonly isPlatformAdminActive: PlatformAdminActiveCheck;
}

@Injectable()
export class ResolveSessionService {
  private readonly logger = new Logger(ResolveSessionService.name);

  constructor(private readonly sessions: SessionRepository) {}

  async resolve(
    rawToken: string,
    loaders: SessionActorLoaders,
  ): Promise<ActorContext | null> {
    const session = await this.sessions.findActiveByTokenHash(
      hashSessionToken(rawToken),
    );

    if (!session) {
      return null;
    }

    const actor = await this.currentActor(session.actor, loaders);

    if (!actor) {
      await this.revokeStale(session.id);
      return null;
    }

    // touch() does not check expiry, so it must only follow a successful
    // find; it also follows the activity check, so a session of an actor that
    // may no longer act is never extended.
    await this.sessions.touch(
      session.id,
      new Date(Date.now() + SESSION_TTL_MS),
    );

    return actor;
  }

  private async currentActor(
    sessionActor: SessionActor,
    loaders: SessionActorLoaders,
  ): Promise<ActorContext | null> {
    if (sessionActor.actorType === 'PLATFORM_ADMIN') {
      const active = await loaders.isPlatformAdminActive(
        sessionActor.platformAdminId,
      );

      return active
        ? {
            kind: 'PLATFORM_ADMIN',
            platformAdminId: sessionActor.platformAdminId,
          }
        : null;
    }

    const permissions = await loaders.loadTenantUserPermissions(
      sessionActor.tenantId,
      sessionActor.userId,
    );

    if (permissions === null) {
      return null;
    }

    return {
      kind: 'TENANT_USER',
      tenantId: sessionActor.tenantId,
      userId: sessionActor.userId,
      permissions: new Set(permissions),
    };
  }

  // A session that reached an actor who may no longer act is revoked, so it
  // stays dead even if the actor is reactivated later (a new login is then
  // required). Best effort: the request is rejected whether or not the revoke
  // succeeds, and the next request re-checks the actor anyway.
  private async revokeStale(sessionId: string): Promise<void> {
    try {
      await this.sessions.revoke(sessionId);
    } catch (error) {
      this.logger.warn(
        `Could not revoke session ${sessionId} of an inactive actor: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
