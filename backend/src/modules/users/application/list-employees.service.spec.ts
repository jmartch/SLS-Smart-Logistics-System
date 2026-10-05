import { ListEmployeesService } from './list-employees.service';
import { InMemoryUserManagementRepository } from './__tests__/in-memory-user-management.repository';
import { MANAGE_EMPLOYEES } from '../domain/employee';

describe('ListEmployeesService', () => {
  it('lists only the employees of the context tenant, without credentials', async () => {
    const repository = new InMemoryUserManagementRepository();
    const role = repository.addRole('tenant-a', [MANAGE_EMPLOYEES]);
    const own = repository.addUser('tenant-a', {
      email: 'admin@a.test',
      roleIds: [role],
    });
    const inactive = repository.addUser('tenant-a', {
      email: 'gone@a.test',
      status: 'INACTIVE',
    });
    repository.addUser('tenant-b', { email: 'admin@b.test' });
    const service = new ListEmployeesService(repository);

    const employees = await service.list({
      tenantId: 'tenant-a',
      userId: own,
      permissions: new Set([MANAGE_EMPLOYEES]),
    });

    expect(employees).toEqual([
      { id: own, email: 'admin@a.test', status: 'ACTIVE', roleIds: [role] },
      { id: inactive, email: 'gone@a.test', status: 'INACTIVE', roleIds: [] },
    ]);
  });
});
