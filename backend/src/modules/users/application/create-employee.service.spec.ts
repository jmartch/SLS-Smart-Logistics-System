import { CreateEmployeeService } from './create-employee.service';
import { InMemoryUserManagementRepository } from './__tests__/in-memory-user-management.repository';
import { verifyPassword } from '../../auth/domain/password-hasher';
import {
  EmployeeAdministrationBusyError,
  MANAGE_EMPLOYEES,
} from '../domain/employee';
import type { TenantContext } from '../../../shared/application/tenant-context';

const TENANT = 'tenant-a';
const OTHER_TENANT = 'tenant-b';
const PASSWORD = 'employee password';

// The caller must be a real user of the repository: the service re-checks,
// inside the exclusive section, that it still holds MANAGE_EMPLOYEES. The
// permission set below is what the guard saw and is deliberately not trusted.
function contextFor(tenantId: string, userId: string): TenantContext {
  return {
    tenantId,
    userId,
    permissions: new Set([MANAGE_EMPLOYEES]),
  };
}

describe('CreateEmployeeService', () => {
  let repository: InMemoryUserManagementRepository;
  let service: CreateEmployeeService;
  let roleId: string;
  let adminRoleId: string;
  let caller: string;

  // Users of the tenant other than the caller fixture.
  function createdUserCount(): number {
    return [...repository.users.values()].filter((user) => user.id !== caller)
      .length;
  }

  beforeEach(() => {
    repository = new InMemoryUserManagementRepository();
    service = new CreateEmployeeService(repository);
    roleId = repository.addRole(TENANT, ['OPERATE_DELIVERIES']);
    adminRoleId = repository.addRole(TENANT, [MANAGE_EMPLOYEES]);
    caller = repository.addUser(TENANT, {
      email: 'owner@a.test',
      roleIds: [adminRoleId],
    });
  });

  it('creates the employee in the context tenant and returns its record without credentials', async () => {
    const result = await service.create(contextFor(TENANT, caller), {
      email: 'courier@a.test',
      password: PASSWORD,
      roleIds: [roleId],
    });

    expect(result.kind).toBe('OK');
    if (result.kind !== 'OK') {
      return;
    }
    expect(result.employee).toEqual({
      id: expect.any(String) as string,
      email: 'courier@a.test',
      status: 'ACTIVE',
      roleIds: [roleId],
    });
    expect(Object.keys(result.employee).sort()).toEqual([
      'email',
      'id',
      'roleIds',
      'status',
    ]);
    expect(repository.user(result.employee.id).tenantId).toBe(TENANT);
    expect(repository.exclusiveTenantIds).toEqual([TENANT]);
  });

  it('trims and lowercases the email before storing it', async () => {
    const result = await service.create(contextFor(TENANT, caller), {
      email: '  Courier@A.Test ',
      password: PASSWORD,
      roleIds: [roleId],
    });

    expect(result.kind).toBe('OK');
    if (result.kind === 'OK') {
      expect(result.employee.email).toBe('courier@a.test');
      expect(repository.user(result.employee.id).email).toBe('courier@a.test');
    }
  });

  it('stores an argon2 hash of the password, never the password', async () => {
    const result = await service.create(contextFor(TENANT, caller), {
      email: 'courier@a.test',
      password: PASSWORD,
      roleIds: [roleId],
    });

    if (result.kind !== 'OK') {
      throw new Error('expected the employee to be created');
    }
    const stored = repository.user(result.employee.id).passwordHash;
    expect(stored).not.toBe(PASSWORD);
    expect(stored).toMatch(/^\$argon2/);
    await expect(verifyPassword(stored, PASSWORD)).resolves.toBe(true);
  });

  it('answers ROLE_NOT_IN_TENANT for a role of another tenant and creates nothing', async () => {
    const foreignRole = repository.addRole(OTHER_TENANT, [MANAGE_EMPLOYEES]);

    const result = await service.create(contextFor(TENANT, caller), {
      email: 'courier@a.test',
      password: PASSWORD,
      roleIds: [roleId, foreignRole],
    });

    expect(result).toEqual({ kind: 'ROLE_NOT_IN_TENANT' });
    expect(createdUserCount()).toBe(0);
  });

  it('answers ROLE_NOT_IN_TENANT for an unknown role id', async () => {
    const result = await service.create(contextFor(TENANT, caller), {
      email: 'courier@a.test',
      password: PASSWORD,
      roleIds: ['missing-role'],
    });

    expect(result).toEqual({ kind: 'ROLE_NOT_IN_TENANT' });
    expect(createdUserCount()).toBe(0);
  });

  it('answers EMAIL_ALREADY_EXISTS when the normalized email exists in the tenant', async () => {
    repository.addUser(TENANT, { email: 'courier@a.test' });

    const result = await service.create(contextFor(TENANT, caller), {
      email: ' COURIER@a.test',
      password: PASSWORD,
      roleIds: [roleId],
    });

    expect(result).toEqual({ kind: 'EMAIL_ALREADY_EXISTS' });
    expect(createdUserCount()).toBe(1);
  });

  it('allows an email that only exists in another tenant', async () => {
    repository.addUser(OTHER_TENANT, { email: 'courier@a.test' });

    const result = await service.create(contextFor(TENANT, caller), {
      email: 'courier@a.test',
      password: PASSWORD,
      roleIds: [roleId],
    });

    expect(result.kind).toBe('OK');
    expect(createdUserCount()).toBe(2);
  });

  describe('caller re-check inside the exclusive section', () => {
    it.each([
      ['holds no role granting MANAGE_EMPLOYEES', 'ACTIVE', false],
      ['is an INACTIVE admin', 'INACTIVE', true],
    ] as const)(
      'answers CALLER_NOT_ALLOWED when the caller %s, and creates nothing',
      async (_label, callerStatus, callerIsAdmin) => {
        const weakCaller = repository.addUser(TENANT, {
          roleIds: callerIsAdmin ? [adminRoleId] : [roleId],
          status: callerStatus,
        });
        const before = repository.users.size;

        const result = await service.create(contextFor(TENANT, weakCaller), {
          email: 'escalated@a.test',
          password: PASSWORD,
          roleIds: [adminRoleId],
        });

        expect(result).toEqual({ kind: 'CALLER_NOT_ALLOWED' });
        expect(repository.users.size).toBe(before);
      },
    );

    it('refuses a request that waited on the lock while its caller was demoted', async () => {
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
        await tx.setRoles(caller, [roleId]);
      });
      await holding;

      const pending = service.create(contextFor(TENANT, caller), {
        email: 'late@a.test',
        password: PASSWORD,
        roleIds: [roleId],
      });
      // The request's exclusive section is queued behind the demotion, so it
      // only runs once the demotion has committed.
      releaseDemotion();
      await demotion;

      await expect(pending).resolves.toEqual({ kind: 'CALLER_NOT_ALLOWED' });
      expect(createdUserCount()).toBe(0);
    });
  });

  it('answers BUSY when the exclusive section cannot be entered in time', async () => {
    jest
      .spyOn(repository, 'runExclusive')
      .mockRejectedValue(new EmployeeAdministrationBusyError());

    await expect(
      service.create(contextFor(TENANT, caller), {
        email: 'courier@a.test',
        password: PASSWORD,
        roleIds: [roleId],
      }),
    ).resolves.toEqual({ kind: 'BUSY' });
    expect(createdUserCount()).toBe(0);
  });

  it('propagates unexpected repository failures', async () => {
    const failure = new Error('database unavailable');
    jest.spyOn(repository, 'runExclusive').mockRejectedValue(failure);

    await expect(
      service.create(contextFor(TENANT, caller), {
        email: 'courier@a.test',
        password: PASSWORD,
        roleIds: [roleId],
      }),
    ).rejects.toBe(failure);
  });
});
