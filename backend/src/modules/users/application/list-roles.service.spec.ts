import { ListRolesService } from './list-roles.service';
import { InMemoryUserManagementRepository } from './__tests__/in-memory-user-management.repository';
import { MANAGE_EMPLOYEES } from '../domain/employee';
import type { TenantContext } from '../../../shared/application/tenant-context';

function contextFor(tenantId: string): TenantContext {
  return {
    tenantId,
    userId: 'user-a',
    permissions: new Set([MANAGE_EMPLOYEES]),
  };
}

describe('ListRolesService', () => {
  it('returns only the assignable roles of the caller tenant ordered by name with sorted permissions', async () => {
    const repository = new InMemoryUserManagementRepository();
    const service = new ListRolesService(repository);

    const courierId = repository.addRole(
      'tenant-a',
      ['OPERATE_DELIVERIES'],
      'Courier',
    );
    const adminId = repository.addRole(
      'tenant-a',
      ['MANAGE_TENANT', MANAGE_EMPLOYEES],
      'Administrator',
    );
    repository.addRole('tenant-b', [MANAGE_EMPLOYEES], 'Other Tenant Admin');

    const roles = await service.listRoles(contextFor('tenant-a'));

    expect(roles).toEqual([
      {
        id: adminId,
        name: 'Administrator',
        permissions: [MANAGE_EMPLOYEES, 'MANAGE_TENANT'],
      },
      {
        id: courierId,
        name: 'Courier',
        permissions: ['OPERATE_DELIVERIES'],
      },
    ]);
  });
});
