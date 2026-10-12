import { Injectable } from '@nestjs/common';
import { UserManagementRepository } from '../domain/user-management.repository';
import type { EmployeeRecord } from '../domain/employee';
import type { TenantContext } from '../../../shared/application/tenant-context';

@Injectable()
export class ListEmployeesService {
  constructor(private readonly repository: UserManagementRepository) {}

  list(context: TenantContext): Promise<readonly EmployeeRecord[]> {
    return this.repository.list(context.tenantId);
  }
}
