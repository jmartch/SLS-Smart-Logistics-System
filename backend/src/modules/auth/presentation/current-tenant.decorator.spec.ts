import { UnauthorizedException } from '@nestjs/common';
import { getCurrentTenant } from '../../../shared/presentation/request-context.decorator';
import { NotATenantActorError } from '../../../shared/application/tenant-context';
import type { ActorContext } from '../../../shared/application/actor-context';

describe('getCurrentTenant', () => {
  it('returns only the tenant context of a tenant-user actor', () => {
    const permissions = new Set(['P1']);
    const actor: ActorContext = {
      kind: 'TENANT_USER',
      tenantId: 'tenant-a',
      userId: 'user-1',
      permissions,
    };

    const context = getCurrentTenant({ actor });

    expect(context).toEqual({
      tenantId: 'tenant-a',
      userId: 'user-1',
      permissions,
    });
    expect(Object.keys(context).sort()).toEqual([
      'permissions',
      'tenantId',
      'userId',
    ]);
  });

  it('throws NotATenantActorError for a platform admin', () => {
    const actor: ActorContext = {
      kind: 'PLATFORM_ADMIN',
      platformAdminId: 'admin-1',
    };

    expect(() => getCurrentTenant({ actor })).toThrow(NotATenantActorError);
  });

  it('fails loudly when no actor is attached (route is missing AuthGuard)', () => {
    expect(() => getCurrentTenant({})).toThrow(UnauthorizedException);
  });
});
