import { Injectable } from '@nestjs/common';
import { UserManagementRepository } from '../domain/user-management.repository';
import { MANAGE_EMPLOYEES } from '../domain/employee';
import type { TenantContext } from '../../../shared/application/tenant-context';

export type UpdateEmployeeRolesResult =
  | { readonly kind: 'OK' }
  | { readonly kind: 'LAST_ADMIN' }
  | { readonly kind: 'ROLE_NOT_IN_TENANT' }
  | { readonly kind: 'NOT_FOUND' };

@Injectable()
export class UpdateEmployeeRolesService {
  constructor(private readonly repository: UserManagementRepository) {}

  updateRoles(
    context: TenantContext,
    employeeId: string,
    roleIds: readonly string[],
  ): Promise<UpdateEmployeeRolesResult> {
    // Sessions are not revoked: the guard reloads permissions per request, so
    // the new roles take effect on the employee's next call.
    return this.repository.runExclusive(
      context.tenantId,
      async (tx): Promise<UpdateEmployeeRolesResult> => {
        if (!(await tx.rolesBelongToTenant(roleIds))) {
          return { kind: 'ROLE_NOT_IN_TENANT' };
        }

        // Only a change that removes the permission from an active holder
        // can leave the tenant without admins; moving to another role that
        // also grants it is allowed even for the last admin.
        if (
          (await tx.userHasPermission(employeeId, MANAGE_EMPLOYEES)) &&
          !(await tx.roleIdsGrantPermission(roleIds, MANAGE_EMPLOYEES)) &&
          (await tx.countActiveUsersWithPermission(MANAGE_EMPLOYEES)) <= 1
        ) {
          return { kind: 'LAST_ADMIN' };
        }

        const found = await tx.setRoles(employeeId, roleIds);
        return found ? { kind: 'OK' } : { kind: 'NOT_FOUND' };
      },
    );
  }
}
