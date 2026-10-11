import type { ActorContext } from './actor-context';

export interface TenantContext {
  readonly tenantId: string;
  readonly userId: string;
  readonly permissions: ReadonlySet<string>;
}

export class NotATenantActorError extends Error {
  readonly code = 'FORBIDDEN';

  constructor(
    message = 'This operation requires a tenant-user actor, not a platform admin',
  ) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function requireTenantContext(actor: ActorContext): TenantContext {
  if (actor.kind !== 'TENANT_USER') {
    throw new NotATenantActorError();
  }

  return {
    tenantId: actor.tenantId,
    userId: actor.userId,
    permissions: actor.permissions,
  };
}

export function hasPermission(
  context: TenantContext,
  permission: string,
): boolean {
  return context.permissions.has(permission);
}
