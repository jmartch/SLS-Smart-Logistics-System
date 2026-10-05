import { UpdateEmployeeStatusService } from './update-employee-status.service';
import {
  InMemoryUserManagementRepository,
  RecordingSessionRepository,
} from './__tests__/in-memory-user-management.repository';
import { MANAGE_EMPLOYEES } from '../domain/employee';
import type { TenantContext } from '../../../shared/application/tenant-context';

const TENANT = 'tenant-a';
const OTHER_TENANT = 'tenant-b';

function contextFor(tenantId: string, userId = 'actor'): TenantContext {
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
      contextFor(TENANT),
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
      contextFor(TENANT),
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
      repository.addUser(TENANT, { roleIds: [adminRole] });
      const courier = repository.addUser(TENANT, { roleIds: [courierRole] });

      const result = await service.updateStatus(
        contextFor(TENANT),
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
    const courier = repository.addUser(TENANT, {
      roleIds: [courierRole],
      status: 'SUSPENDED',
    });

    const result = await service.updateStatus(
      contextFor(TENANT),
      courier,
      'ACTIVE',
    );

    expect(result).toEqual({ kind: 'OK' });
    expect(repository.user(courier).status).toBe('ACTIVE');
    expect(sessions.revokedUsers).toEqual([]);
  });

  it('answers NOT_FOUND for an unknown id without revoking', async () => {
    const result = await service.updateStatus(
      contextFor(TENANT),
      'missing-user',
      'INACTIVE',
    );

    expect(result).toEqual({ kind: 'NOT_FOUND' });
    expect(sessions.revokedUsers).toEqual([]);
  });

  it('answers NOT_FOUND for a user of another tenant, leaves it untouched and revokes nothing', async () => {
    const foreignAdminRole = repository.addRole(OTHER_TENANT, [
      MANAGE_EMPLOYEES,
    ]);
    const foreign = repository.addUser(OTHER_TENANT, {
      roleIds: [foreignAdminRole],
    });
    repository.addUser(OTHER_TENANT, { roleIds: [foreignAdminRole] });

    const result = await service.updateStatus(
      contextFor(TENANT),
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

  it('lets only one of two concurrent deactivations of the last two admins succeed', async () => {
    const first = repository.addUser(TENANT, { roleIds: [adminRole] });
    const second = repository.addUser(TENANT, { roleIds: [adminRole] });

    const results = await Promise.all([
      service.updateStatus(contextFor(TENANT, first), second, 'INACTIVE'),
      service.updateStatus(contextFor(TENANT, second), first, 'INACTIVE'),
    ]);

    expect(results.map((r) => r.kind).sort()).toEqual(['LAST_ADMIN', 'OK']);
    const active = [first, second].filter(
      (id) => repository.user(id).status === 'ACTIVE',
    );
    expect(active).toHaveLength(1);
    expect(sessions.revokedUsers).toHaveLength(1);
  });
});
