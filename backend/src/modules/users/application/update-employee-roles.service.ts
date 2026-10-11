import { Injectable } from '@nestjs/common';
import { UserManagementRepository } from '../domain/user-management.repository';
import {
  EmployeeAdministrationBusyError,
  MANAGE_EMPLOYEES,
} from '../domain/employee';
import type { TenantContext } from '../../../shared/application/tenant-context';

export type UpdateEmployeeRolesResult =
  | { readonly kind: 'OK' }
  | { readonly kind: 'LAST_ADMIN' }
  | { readonly kind: 'ROLE_NOT_IN_TENANT' }
  | { readonly kind: 'NOT_FOUND' }
  | { readonly kind: 'CALLER_NOT_ALLOWED' }
  | { readonly kind: 'BUSY' };

@Injectable()
export class UpdateEmployeeRolesService {
  constructor(private readonly repository: UserManagementRepository) {}

  async updateRoles(
    context: TenantContext,
    employeeId: string,
    roleIds: readonly string[],
  ): Promise<UpdateEmployeeRolesResult> {
    try {
      // Sessions are not revoked: the guard reloads permissions per request,
      // so the new roles take effect on the employee's next call.
      return await this.repository.runExclusive(
        context.tenantId,
        async (tx): Promise<UpdateEmployeeRolesResult> => {
          // Re-checked inside the lock: the caller may have been demoted
          // after the guard let this request through.
          if (!(await tx.userHasPermission(context.userId, MANAGE_EMPLOYEES))) {
            return { kind: 'CALLER_NOT_ALLOWED' };
          }

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
          if (!found) {
            return { kind: 'NOT_FOUND' };
          }

          await tx.recordAudit({
            actorUserId: context.userId,
            action: 'EMPLOYEE_ROLES_UPDATED',
            targetUserId: employeeId,
            metadata: { roleIds: [...new Set(roleIds)] },
          });
          return { kind: 'OK' };
        },
      );
    } catch (error) {
      if (error instanceof EmployeeAdministrationBusyError) {
        return { kind: 'BUSY' };
      }
      throw error;
    }
  }
}
