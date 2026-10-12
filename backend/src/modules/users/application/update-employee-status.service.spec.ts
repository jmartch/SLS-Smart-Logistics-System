import { UpdateEmployeeStatusService } from './update-employee-status.service';
import {
  InMemoryUserManagementRepository,
  RecordingSessionRepository,
} from './__tests__/in-memory-user-management.repository';
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

describe('UpdateEmployeeStatusService', () => {
  let repository: InMemoryUserManagementRepository;
  let sessions: RecordingSessionRepository;
  let service: UpdateEmployeeStatusService;
  let adminRole: string;
  let courierRole: string;

  beforeEach(() => {
    repository = new InMemoryUserManagementRepository();
    sessions = new RecordingSessionRepository(repository.events);
    service = new UpdateEmployeeStatusService(repository, sessions);
    adminRole = repository.addRole(TENANT, [MANAGE_EMPLOYEES, 'MANAGE_TENANT']);
    courierRole = repository.addRole(TENANT, ['OPERATE_DELIVERIES']);
  });

  it.each(['INACTIVE', 'SUSPENDED'] as const)(
    'refuses to make the last active admin %s and revokes nothing',
    async (status) => {
      const admin = repository.addUser(TENANT, { roleIds: [adminRole] });

      const result = await service.updateStatus(
        contextFor(TENANT, admin),
        admin,
        status,
      );

      expect(result).toEqual({ kind: 'LAST_ADMIN' });
      expect(repository.user(admin).status).toBe('ACTIVE');
      expect(sessions.revokedUsers).toEqual([]);
    },
  );

  it('does not count an inactive holder of the permission as a remaining admin', async () => {
    const admin = repository.addUser(TENANT, { roleIds: [adminRole] });
    repository.addUser(TENANT, { roleIds: [adminRole], status: 'INACTIVE' });

    const result = await service.updateStatus(
      contextFor(TENANT, admin),
      admin,
      'INACTIVE',
    );

    expect(result).toEqual({ kind: 'LAST_ADMIN' });
  });

  it('does not count an admin of another tenant', async () => {
    const admin = repository.addUser(TENANT, { roleIds: [adminRole] });
    const foreignAdminRole = repository.addRole(OTHER_TENANT, [
      MANAGE_EMPLOYEES,
    ]);
    repository.addUser(OTHER_TENANT, { roleIds: [foreignAdminRole] });

    const result = await service.updateStatus(
      contextFor(TENANT, admin),
      admin,
      'INACTIVE',
    );

    expect(result).toEqual({ kind: 'LAST_ADMIN' });
  });

  it('deactivates one of two admins, then refuses the remaining one', async () => {
    const first = repository.addUser(TENANT, { roleIds: [adminRole] });
    const second = repository.addUser(TENANT, { roleIds: [adminRole] });

    await expect(
      service.updateStatus(contextFor(TENANT, first), second, 'INACTIVE'),
    ).resolves.toEqual({ kind: 'OK' });
    expect(repository.user(second).status).toBe('INACTIVE');

    await expect(
      service.updateStatus(contextFor(TENANT, first), first, 'INACTIVE'),
    ).resolves.toEqual({ kind: 'LAST_ADMIN' });
    expect(repository.user(first).status).toBe('ACTIVE');
  });

  it.each(['INACTIVE', 'SUSPENDED'] as const)(
    'revokes all sessions of an employee made %s, after the commit',
    async (status) => {
      const admin = repository.addUser(TENANT, { roleIds: [adminRole] });
      const courier = repository.addUser(TENANT, { roleIds: [courierRole] });

      const result = await service.updateStatus(
        contextFor(TENANT, admin),
        courier,
        status,
      );

      expect(result).toEqual({ kind: 'OK' });
      expect(repository.user(courier).status).toBe(status);
      expect(sessions.revokedUsers).toEqual([
        { tenantId: TENANT, userId: courier },
      ]);
      expect(repository.events).toEqual(['commit', `revoke:${courier}`]);
    },
  );

  it('reactivates an employee without revoking sessions', async () => {
    const admin = repository.addUser(TENANT, { roleIds: [adminRole] });
    const courier = repository.addUser(TENANT, {
      roleIds: [courierRole],
      status: 'SUSPENDED',
    });

    const result = await service.updateStatus(
      contextFor(TENANT, admin),
      courier,
      'ACTIVE',
    );

    expect(result).toEqual({ kind: 'OK' });
    expect(repository.user(courier).status).toBe('ACTIVE');
    expect(sessions.revokedUsers).toEqual([]);
    expect(repository.auditEntries).toEqual([
      {
        tenantId: TENANT,
        actorUserId: admin,
        action: 'EMPLOYEE_STATUS_UPDATED',
        targetUserId: courier,
        metadata: { status: 'ACTIVE' },
      },
    ]);
  });

  it('answers NOT_FOUND for an unknown id without revoking', async () => {
    const admin = repository.addUser(TENANT, { roleIds: [adminRole] });

    const result = await service.updateStatus(
      contextFor(TENANT, admin),
      'missing-user',
      'INACTIVE',
    );

    expect(result).toEqual({ kind: 'NOT_FOUND' });
    expect(sessions.revokedUsers).toEqual([]);
  });

  it('answers NOT_FOUND for a user of another tenant, leaves it untouched and revokes nothing', async () => {
    const admin = repository.addUser(TENANT, { roleIds: [adminRole] });
    const foreignAdminRole = repository.addRole(OTHER_TENANT, [
      MANAGE_EMPLOYEES,
    ]);
    const foreign = repository.addUser(OTHER_TENANT, {
      roleIds: [foreignAdminRole],
    });
    repository.addUser(OTHER_TENANT, { roleIds: [foreignAdminRole] });

    const result = await service.updateStatus(
      contextFor(TENANT, admin),
      foreign,
      'INACTIVE',
    );

    expect(result).toEqual({ kind: 'NOT_FOUND' });
    expect(repository.user(foreign).status).toBe('ACTIVE');
    expect(sessions.revokedUsers).toEqual([]);
  });

  it('decides and writes inside one exclusive section of the context tenant', async () => {
    const admin = repository.addUser(TENANT, { roleIds: [adminRole] });
    const courier = repository.addUser(TENANT, { roleIds: [courierRole] });

    await service.updateStatus(contextFor(TENANT, admin), courier, 'INACTIVE');

    expect(repository.exclusiveTenantIds).toEqual([TENANT]);
  });

  it('lets only one of the last two admins deactivate itself when both try at once', async () => {
    const first = repository.addUser(TENANT, { roleIds: [adminRole] });
    const second = repository.addUser(TENANT, { roleIds: [adminRole] });

    const results = await Promise.all([
      service.updateStatus(contextFor(TENANT, first), first, 'INACTIVE'),
      service.updateStatus(contextFor(TENANT, second), second, 'INACTIVE'),
    ]);

    // Whichever runs second is still an admin caller, but would leave none.
    expect(results.map((r) => r.kind).sort()).toEqual(['LAST_ADMIN', 'OK']);
    const active = [first, second].filter(
      (id) => repository.user(id).status === 'ACTIVE',
    );
    expect(active).toHaveLength(1);
    expect(sessions.revokedUsers).toHaveLength(1);
  });

  it('lets only one of two crossed deactivations of the last two admins succeed', async () => {
    const first = repository.addUser(TENANT, { roleIds: [adminRole] });
    const second = repository.addUser(TENANT, { roleIds: [adminRole] });

    const results = await Promise.all([
      service.updateStatus(contextFor(TENANT, first), second, 'INACTIVE'),
      service.updateStatus(contextFor(TENANT, second), first, 'INACTIVE'),
    ]);

    // The loser's caller was deactivated by the winner, so it is refused as
    // a caller before the last-admin rule is evaluated. One admin remains.
    expect(results.map((r) => r.kind).sort()).toEqual([
      'CALLER_NOT_ALLOWED',
      'OK',
    ]);
    const active = [first, second].filter(
      (id) => repository.user(id).status === 'ACTIVE',
    );
    expect(active).toHaveLength(1);
    expect(sessions.revokedUsers).toHaveLength(1);
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

        const result = await service.updateStatus(
          contextFor(TENANT, caller),
          courier,
          'INACTIVE',
        );

        expect(result).toEqual({ kind: 'CALLER_NOT_ALLOWED' });
        expect(repository.user(courier).status).toBe('ACTIVE');
        expect(sessions.revokedUsers).toEqual([]);
      },
    );

    it('answers CALLER_NOT_ALLOWED for a caller id of another tenant', async () => {
      const foreignAdminRole = repository.addRole(OTHER_TENANT, [
        MANAGE_EMPLOYEES,
      ]);
      const foreignAdmin = repository.addUser(OTHER_TENANT, {
        roleIds: [foreignAdminRole],
      });
      repository.addUser(TENANT, { roleIds: [adminRole] });
      const courier = repository.addUser(TENANT, { roleIds: [courierRole] });

      const result = await service.updateStatus(
        contextFor(TENANT, foreignAdmin),
        courier,
        'INACTIVE',
      );

      expect(result).toEqual({ kind: 'CALLER_NOT_ALLOWED' });
      expect(repository.user(courier).status).toBe('ACTIVE');
    });

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
      // Another administrator's exclusive section holds the lock first and
      // removes the caller's admin role.
      const demotion = repository.runExclusive(TENANT, async (tx) => {
        signalHolding();
        await demotionMayWrite;
        await tx.setRoles(caller, [courierRole]);
      });
      await holding;

      const pending = service.updateStatus(
        contextFor(TENANT, caller),
        courier,
        'INACTIVE',
      );
      releaseDemotion();
      await demotion;

      await expect(pending).resolves.toEqual({ kind: 'CALLER_NOT_ALLOWED' });
      expect(repository.user(courier).status).toBe('ACTIVE');
      expect(sessions.revokedUsers).toEqual([]);
    });
  });

  it('answers BUSY when the exclusive section cannot be entered in time, and revokes nothing', async () => {
    const admin = repository.addUser(TENANT, { roleIds: [adminRole] });
    const courier = repository.addUser(TENANT, { roleIds: [courierRole] });
    jest
      .spyOn(repository, 'runExclusive')
      .mockRejectedValue(new EmployeeAdministrationBusyError());

    await expect(
      service.updateStatus(contextFor(TENANT, admin), courier, 'INACTIVE'),
    ).resolves.toEqual({ kind: 'BUSY' });
    expect(repository.user(courier).status).toBe('ACTIVE');
    expect(sessions.revokedUsers).toEqual([]);
  });

  it('propagates other repository failures', async () => {
    const admin = repository.addUser(TENANT, { roleIds: [adminRole] });
    const failure = new Error('database unavailable');
    jest.spyOn(repository, 'runExclusive').mockRejectedValue(failure);

    await expect(
      service.updateStatus(contextFor(TENANT, admin), admin, 'ACTIVE'),
    ).rejects.toBe(failure);
  });
});
