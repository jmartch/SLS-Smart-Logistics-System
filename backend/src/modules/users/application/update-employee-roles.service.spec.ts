import { UpdateEmployeeRolesService } from './update-employee-roles.service';
import { InMemoryUserManagementRepository } from './__tests__/in-memory-user-management.repository';
import { MANAGE_EMPLOYEES } from '../domain/employee';
import type { TenantContext } from '../../../shared/application/tenant-context';

const TENANT = 'tenant-a';
const OTHER_TENANT = 'tenant-b';

function contextFor(tenantId: string, userId = 'actor'): TenantContext {
  return { tenantId, userId, permissions: new Set([MANAGE_EMPLOYEES]) };
}

describe('UpdateEmployeeRolesService', () => {
  let repository: InMemoryUserManagementRepository;
  let service: UpdateEmployeeRolesService;
  let adminRole: string;
  let otherAdminRole: string;
  let courierRole: string;

  beforeEach(() => {
    repository = new InMemoryUserManagementRepository();
    service = new UpdateEmployeeRolesService(repository);
    adminRole = repository.addRole(TENANT, [MANAGE_EMPLOYEES, 'MANAGE_TENANT']);
    otherAdminRole = repository.addRole(TENANT, [MANAGE_EMPLOYEES]);
    courierRole = repository.addRole(TENANT, ['OPERATE_DELIVERIES']);
  });

  it('lets the sole admin move to a different role that also grants the permission', async () => {
    const admin = repository.addUser(TENANT, { roleIds: [adminRole] });

    const result = await service.updateRoles(contextFor(TENANT, admin), admin, [
      otherAdminRole,
      courierRole,
    ]);

    expect(result).toEqual({ kind: 'OK' });
    expect(repository.user(admin).roleIds).toEqual([
      otherAdminRole,
      courierRole,
    ]);
  });

  it.each([
    ['a role set without the permission', () => [courierRole]],
    ['an empty role set', () => []],
  ])(
    'refuses to give the sole admin %s and keeps the roles',
    async (_label, roleIds) => {
      const admin = repository.addUser(TENANT, { roleIds: [adminRole] });

      const result = await service.updateRoles(
        contextFor(TENANT, admin),
        admin,
        roleIds(),
      );

      expect(result).toEqual({ kind: 'LAST_ADMIN' });
      expect(repository.user(admin).roleIds).toEqual([adminRole]);
    },
  );

  it('removes the permission from one of two admins', async () => {
    const first = repository.addUser(TENANT, { roleIds: [adminRole] });
    const second = repository.addUser(TENANT, { roleIds: [otherAdminRole] });

    await expect(
      service.updateRoles(contextFor(TENANT, first), second, [courierRole]),
    ).resolves.toEqual({ kind: 'OK' });

    await expect(
      service.updateRoles(contextFor(TENANT, first), first, [courierRole]),
    ).resolves.toEqual({ kind: 'LAST_ADMIN' });
  });

  it('changes the roles of a non-admin employee even when there is a single admin', async () => {
    repository.addUser(TENANT, { roleIds: [adminRole] });
    const courier = repository.addUser(TENANT, { roleIds: [courierRole] });

    await expect(
      service.updateRoles(contextFor(TENANT), courier, []),
    ).resolves.toEqual({ kind: 'OK' });
    expect(repository.user(courier).roleIds).toEqual([]);
  });

  it('lets an inactive holder of the permission lose it (only active admins are protected)', async () => {
    repository.addUser(TENANT, { roleIds: [adminRole] });
    const inactive = repository.addUser(TENANT, {
      roleIds: [adminRole],
      status: 'INACTIVE',
    });

    await expect(
      service.updateRoles(contextFor(TENANT), inactive, [courierRole]),
    ).resolves.toEqual({ kind: 'OK' });
  });

  it('promotes an employee to admin', async () => {
    const courier = repository.addUser(TENANT, { roleIds: [courierRole] });

    await expect(
      service.updateRoles(contextFor(TENANT), courier, [adminRole]),
    ).resolves.toEqual({ kind: 'OK' });
    expect(repository.user(courier).roleIds).toEqual([adminRole]);
  });

  it('answers ROLE_NOT_IN_TENANT for a role of another tenant and keeps the roles', async () => {
    const courier = repository.addUser(TENANT, { roleIds: [courierRole] });
    const foreignRole = repository.addRole(OTHER_TENANT, [MANAGE_EMPLOYEES]);

    const result = await service.updateRoles(contextFor(TENANT), courier, [
      adminRole,
      foreignRole,
    ]);

    expect(result).toEqual({ kind: 'ROLE_NOT_IN_TENANT' });
    expect(repository.user(courier).roleIds).toEqual([courierRole]);
  });

  it('answers NOT_FOUND for a user of another tenant and leaves it untouched', async () => {
    const foreignRole = repository.addRole(OTHER_TENANT, [
      'OPERATE_DELIVERIES',
    ]);
    const foreign = repository.addUser(OTHER_TENANT, {
      roleIds: [foreignRole],
    });

    const result = await service.updateRoles(contextFor(TENANT), foreign, [
      courierRole,
    ]);

    expect(result).toEqual({ kind: 'NOT_FOUND' });
    expect(repository.user(foreign).roleIds).toEqual([foreignRole]);
  });

  it('answers NOT_FOUND for an unknown id', async () => {
    await expect(
      service.updateRoles(contextFor(TENANT), 'missing-user', [courierRole]),
    ).resolves.toEqual({ kind: 'NOT_FOUND' });
  });

  it('decides and writes inside one exclusive section of the context tenant', async () => {
    const courier = repository.addUser(TENANT, { roleIds: [courierRole] });

    await service.updateRoles(contextFor(TENANT), courier, [adminRole]);

    expect(repository.exclusiveTenantIds).toEqual([TENANT]);
  });

  it('lets only one of two concurrent permission removals from the last two admins succeed', async () => {
    const first = repository.addUser(TENANT, { roleIds: [adminRole] });
    const second = repository.addUser(TENANT, { roleIds: [adminRole] });

    const results = await Promise.all([
      service.updateRoles(contextFor(TENANT, first), second, [courierRole]),
      service.updateRoles(contextFor(TENANT, second), first, [courierRole]),
    ]);

    expect(results.map((r) => r.kind).sort()).toEqual(['LAST_ADMIN', 'OK']);
    const stillAdmins = [first, second].filter((id) =>
      repository.user(id).roleIds.includes(adminRole),
    );
    expect(stillAdmins).toHaveLength(1);
  });
});
