import { requireTenantContext, NotATenantActorError } from './tenant-context';
import type { ActorContext } from './actor-context';

describe('requireTenantContext', () => {
  it('returns the tenant context for a TENANT_USER actor', () => {
    const actor: ActorContext = {
      kind: 'TENANT_USER',
      tenantId: 'tenant-a',
      userId: 'user-a',
      permissions: new Set(['REGISTER_PACKAGES']),
    };

    const context = requireTenantContext(actor);

    expect(context).toEqual({
      tenantId: 'tenant-a',
      userId: 'user-a',
      permissions: new Set(['REGISTER_PACKAGES']),
    });
  });

  it('throws for a PLATFORM_ADMIN actor', () => {
    const actor: ActorContext = {
      kind: 'PLATFORM_ADMIN',
      platformAdminId: 'admin-a',
    };

    expect(() => requireTenantContext(actor)).toThrow(NotATenantActorError);
  });
});
