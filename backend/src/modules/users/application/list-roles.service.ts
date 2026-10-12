import { Injectable } from '@nestjs/common';
import { UserManagementRepository } from '../domain/user-management.repository';
import type { RoleRecord } from '../domain/employee';
import type { TenantContext } from '../../../shared/application/tenant-context';

@Injectable()
export class ListRolesService {
  constructor(private readonly repository: UserManagementRepository) {}

  listRoles(context: TenantContext): Promise<readonly RoleRecord[]> {
    return this.repository.listRoles(context.tenantId);
  }
}
