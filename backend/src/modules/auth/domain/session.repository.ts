export type SessionActor =
  | {
      readonly actorType: 'TENANT_USER';
      readonly tenantId: string;
      readonly userId: string;
    }
  | { readonly actorType: 'PLATFORM_ADMIN'; readonly platformAdminId: string };

export interface SessionRecord {
  readonly id: string;
  readonly actor: SessionActor;
  readonly expiresAt: Date;
}

export abstract class SessionRepository {
  abstract create(
    actor: SessionActor,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<SessionRecord>;
  abstract findActiveByTokenHash(
    tokenHash: string,
  ): Promise<SessionRecord | null>;
  abstract touch(sessionId: string, expiresAt: Date): Promise<void>;
  abstract revoke(sessionId: string): Promise<void>;
  abstract revokeAllForUser(tenantId: string, userId: string): Promise<void>;
}
