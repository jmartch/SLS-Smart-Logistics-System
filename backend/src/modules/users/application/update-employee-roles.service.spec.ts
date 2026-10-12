import { UpdateEmployeeRolesService } from './update-employee-roles.service';
import { InMemoryUserManagementRepository } from './__tests__/in-memory-user-management.repository';
import {
  EmployeeAdministrationBusyError,
  MANAGE_EMPLOYEES,
} from '../domain/employee';
import type { TenantContext } from '../../../shared/application/tenant-context';

const TENANT = 'tenant-a';
const OTHER_TENANT = 'tenant-b';

// The caller must be a real user of the repository: the service re-checks,
// inside the exclusive section, that it still holds MANAGE_EMPLOYEES. The
// permission set below is what the guard saw and is deliberately not trusted.
function contextFor(tenantId: string, userId: string): TenantContext {
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
    const admin = repository.addUser(TENANT, { roleIds: [adminRole] });
    const courier = repository.addUser(TENANT, { roleIds: [courierRole] });

    await expect(
      service.updateRoles(contextFor(TENANT, admin), courier, []),
    ).resolves.toEqual({ kind: 'OK' });
    expect(repository.user(courier).roleIds).toEqual([]);
  });

  it('lets an inactive holder of the permission lose it (only active admins are protected)', async () => {
    const admin = repository.addUser(TENANT, { roleIds: [adminRole] });
    const inactive = repository.addUser(TENANT, {
      roleIds: [adminRole],
      status: 'INACTIVE',
    });

    await expect(
      service.updateRoles(contextFor(TENANT, admin), inactive, [courierRole]),
    ).resolves.toEqual({ kind: 'OK' });
  });

  it('promotes an employee to admin', async () => {
    const admin = repository.addUser(TENANT, { roleIds: [adminRole] });
    const courier = repository.addUser(TENANT, { roleIds: [courierRole] });

    await expect(
      service.updateRoles(contextFor(TENANT, admin), courier, [adminRole]),
    ).resolves.toEqual({ kind: 'OK' });
    expect(repository.user(courier).roleIds).toEqual([adminRole]);
    expect(repository.auditEntries).toEqual([
      {
        tenantId: TENANT,
        actorUserId: admin,
        action: 'EMPLOYEE_ROLES_UPDATED',
        targetUserId: courier,
        metadata: { roleIds: [adminRole] },
      },
    ]);
  });

  it('answers ROLE_NOT_IN_TENANT for a role of another tenant and keeps the roles', async () => {
    const admin = repository.addUser(TENANT, { roleIds: [adminRole] });
    const courier = repository.addUser(TENANT, { roleIds: [courierRole] });
    const foreignRole = repository.addRole(OTHER_TENANT, [MANAGE_EMPLOYEES]);

    const result = await service.updateRoles(
      contextFor(TENANT, admin),
      courier,
      [adminRole, foreignRole],
    );

    expect(result).toEqual({ kind: 'ROLE_NOT_IN_TENANT' });
    expect(repository.user(courier).roleIds).toEqual([courierRole]);
  });

  it('answers NOT_FOUND for a user of another tenant and leaves it untouched', async () => {
    const admin = repository.addUser(TENANT, { roleIds: [adminRole] });
    const foreignRole = repository.addRole(OTHER_TENANT, [
      'OPERATE_DELIVERIES',
    ]);
    const foreign = repository.addUser(OTHER_TENANT, {
      roleIds: [foreignRole],
    });

    const result = await service.updateRoles(
      contextFor(TENANT, admin),
      foreign,
      [courierRole],
    );

    expect(result).toEqual({ kind: 'NOT_FOUND' });
    expect(repository.user(foreign).roleIds).toEqual([foreignRole]);
  });

  it('answers NOT_FOUND for an unknown id', async () => {
    const admin = repository.addUser(TENANT, { roleIds: [adminRole] });

    await expect(
      service.updateRoles(contextFor(TENANT, admin), 'missing-user', [
        courierRole,
      ]),
    ).resolves.toEqual({ kind: 'NOT_FOUND' });
  });

  it('decides and writes inside one exclusive section of the context tenant', async () => {
    const admin = repository.addUser(TENANT, { roleIds: [adminRole] });
    const courier = repository.addUser(TENANT, { roleIds: [courierRole] });

    await service.updateRoles(contextFor(TENANT, admin), courier, [adminRole]);

    expect(repository.exclusiveTenantIds).toEqual([TENANT]);
  });

  it('lets only one of the last two admins drop the permission from itself when both try at once', async () => {
    const first = repository.addUser(TENANT, { roleIds: [adminRole] });
    const second = repository.addUser(TENANT, { roleIds: [adminRole] });

    const results = await Promise.all([
      service.updateRoles(contextFor(TENANT, first), first, [courierRole]),
      service.updateRoles(contextFor(TENANT, second), second, [courierRole]),
    ]);

    expect(results.map((r) => r.kind).sort()).toEqual(['LAST_ADMIN', 'OK']);
    const stillAdmins = [first, second].filter((id) =>
      repository.user(id).roleIds.includes(adminRole),
    );
    expect(stillAdmins).toHaveLength(1);
  });

  it('lets only one of two crossed permission removals from the last two admins succeed', async () => {
    const first = repository.addUser(TENANT, { roleIds: [adminRole] });
    const second = repository.addUser(TENANT, { roleIds: [adminRole] });

    const results = await Promise.all([
      service.updateRoles(contextFor(TENANT, first), second, [courierRole]),
      service.updateRoles(contextFor(TENANT, second), first, [courierRole]),
    ]);

    // The loser's caller lost the permission to the winner first.
    expect(results.map((r) => r.kind).sort()).toEqual([
      'CALLER_NOT_ALLOWED',
      'OK',
    ]);
    const stillAdmins = [first, second].filter((id) =>
      repository.user(id).roleIds.includes(adminRole),
    );
    expect(stillAdmins).toHaveLength(1);
  });

  describe('caller re-check inside the exclusive section', () => {
    it.each([
      ['holds no role granting MANAGE_EMPLOYEES', 'ACTIVE', false],
      ['is an INACTIVE admin', 'INACTIVE', true],
      ['is a SUSPENDED admin', 'SUSPENDED', true],
    ] as const)(
      'answers CALLER_NOT_ALLOWED when the caller %s, and changes nothing',
      async (_label, callerStatus, callerIsAdmin) => {
        repository.addUser(TENANT, { roleIds: [adminRole] });
        const caller = repository.addUser(TENANT, {
          roleIds: callerIsAdmin ? [adminRole] : [courierRole],
          status: callerStatus,
        });
        const courier = repository.addUser(TENANT, { roleIds: [courierRole] });

        // Self-escalation is the interesting case for a non-admin caller.
        const target = callerIsAdmin ? courier : caller;
        const before = [...repository.user(target).roleIds];
        const result = await service.updateRoles(
          contextFor(TENANT, caller),
          target,
          [adminRole],
        );

        expect(result).toEqual({ kind: 'CALLER_NOT_ALLOWED' });
        expect(repository.user(target).roleIds).toEqual(before);
      },
    );

    it('refuses a request that waited on the lock while its caller was demoted', async () => {
      const caller = repository.addUser(TENANT, { roleIds: [adminRole] });
      repository.addUser(TENANT, { roleIds: [adminRole] });
      const courier = repository.addUser(TENANT, { roleIds: [courierRole] });
      let releaseDemotion!: () => void;
      const demotionMayWrite = new Promise<void>((resolve) => {
        releaseDemotion = resolve;
      });
      let signalHolding!: () => void;
      const holding = new Promise<void>((resolve) => {
        signalHolding = resolve;
      });
      const demotion = repository.runExclusive(TENANT, async (tx) => {
        signalHolding();
        await demotionMayWrite;
        await tx.setStatus(caller, 'SUSPENDED');
      });
      await holding;

      const pending = service.updateRoles(contextFor(TENANT, caller), courier, [
        adminRole,
      ]);
      releaseDemotion();
      await demotion;

      await expect(pending).resolves.toEqual({ kind: 'CALLER_NOT_ALLOWED' });
      expect(repository.user(courier).roleIds).toEqual([courierRole]);
    });
  });

  it('answers BUSY when the exclusive section cannot be entered in time', async () => {
    const admin = repository.addUser(TENANT, { roleIds: [adminRole] });
    const courier = repository.addUser(TENANT, { roleIds: [courierRole] });
    jest
      .spyOn(repository, 'runExclusive')
      .mockRejectedValue(new EmployeeAdministrationBusyError());

    await expect(
      service.updateRoles(contextFor(TENANT, admin), courier, [adminRole]),
    ).resolves.toEqual({ kind: 'BUSY' });
    expect(repository.user(courier).roleIds).toEqual([courierRole]);
  });

  it('propagates other repository failures', async () => {
    const admin = repository.addUser(TENANT, { roleIds: [adminRole] });
    const failure = new Error('database unavailable');
    jest.spyOn(repository, 'runExclusive').mockRejectedValue(failure);

    await expect(
      service.updateRoles(contextFor(TENANT, admin), admin, [adminRole]),
    ).rejects.toBe(failure);
  });
});
