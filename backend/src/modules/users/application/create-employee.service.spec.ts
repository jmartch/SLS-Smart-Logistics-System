import { CreateEmployeeService } from './create-employee.service';
import { InMemoryUserManagementRepository } from './__tests__/in-memory-user-management.repository';
import { verifyPassword } from '../../auth/domain/password-hasher';
import { MANAGE_EMPLOYEES } from '../domain/employee';
import type { TenantContext } from '../../../shared/application/tenant-context';

const TENANT = 'tenant-a';
const OTHER_TENANT = 'tenant-b';
const PASSWORD = 'employee password';

function contextFor(tenantId: string): TenantContext {
  return {
    tenantId,
    userId: 'actor',
    permissions: new Set([MANAGE_EMPLOYEES]),
  };
}

describe('CreateEmployeeService', () => {
  let repository: InMemoryUserManagementRepository;
  let service: CreateEmployeeService;
  let roleId: string;

  beforeEach(() => {
    repository = new InMemoryUserManagementRepository();
    service = new CreateEmployeeService(repository);
    roleId = repository.addRole(TENANT, ['OPERATE_DELIVERIES']);
  });

  it('creates the employee in the context tenant and returns its record without credentials', async () => {
    const result = await service.create(contextFor(TENANT), {
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
    const result = await service.create(contextFor(TENANT), {
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
    const result = await service.create(contextFor(TENANT), {
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

    const result = await service.create(contextFor(TENANT), {
      email: 'courier@a.test',
      password: PASSWORD,
      roleIds: [roleId, foreignRole],
    });

    expect(result).toEqual({ kind: 'ROLE_NOT_IN_TENANT' });
    expect(repository.users.size).toBe(0);
  });

  it('answers ROLE_NOT_IN_TENANT for an unknown role id', async () => {
    const result = await service.create(contextFor(TENANT), {
      email: 'courier@a.test',
      password: PASSWORD,
      roleIds: ['missing-role'],
    });

    expect(result).toEqual({ kind: 'ROLE_NOT_IN_TENANT' });
    expect(repository.users.size).toBe(0);
  });

  it('answers EMAIL_ALREADY_EXISTS when the normalized email exists in the tenant', async () => {
    repository.addUser(TENANT, { email: 'courier@a.test' });

    const result = await service.create(contextFor(TENANT), {
      email: ' COURIER@a.test',
      password: PASSWORD,
      roleIds: [roleId],
    });

    expect(result).toEqual({ kind: 'EMAIL_ALREADY_EXISTS' });
    expect(repository.users.size).toBe(1);
  });

  it('allows an email that only exists in another tenant', async () => {
    repository.addUser(OTHER_TENANT, { email: 'courier@a.test' });

    const result = await service.create(contextFor(TENANT), {
      email: 'courier@a.test',
      password: PASSWORD,
      roleIds: [roleId],
    });

    expect(result.kind).toBe('OK');
    expect(repository.users.size).toBe(2);
  });

  it('propagates unexpected repository failures', async () => {
    const failure = new Error('database unavailable');
    jest.spyOn(repository, 'runExclusive').mockRejectedValue(failure);

    await expect(
      service.create(contextFor(TENANT), {
        email: 'courier@a.test',
        password: PASSWORD,
        roleIds: [roleId],
      }),
    ).rejects.toBe(failure);
  });
});
