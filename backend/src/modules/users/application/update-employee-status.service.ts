import { Injectable } from '@nestjs/common';
import { UserManagementRepository } from '../domain/user-management.repository';
import {
  EmployeeAdministrationBusyError,
  MANAGE_EMPLOYEES,
  type EmployeeStatus,
} from '../domain/employee';
import { SessionRepository } from '../../auth/domain/session.repository';
import type { TenantContext } from '../../../shared/application/tenant-context';

export type UpdateEmployeeStatusResult =
  | { readonly kind: 'OK' }
  | { readonly kind: 'LAST_ADMIN' }
  | { readonly kind: 'NOT_FOUND' }
  | { readonly kind: 'CALLER_NOT_ALLOWED' }
  | { readonly kind: 'BUSY' };

@Injectable()
export class UpdateEmployeeStatusService {
  constructor(
    private readonly repository: UserManagementRepository,
    private readonly sessions: SessionRepository,
  ) {}

  async updateStatus(
    context: TenantContext,
    employeeId: string,
    status: EmployeeStatus,
  ): Promise<UpdateEmployeeStatusResult> {
    let result: UpdateEmployeeStatusResult;

    try {
      // Count, decision and write share one exclusive section: two
      // concurrent deactivations of the last two admins cannot both see
      // "2 admins left".
      result = await this.repository.runExclusive(
        context.tenantId,
        async (tx): Promise<UpdateEmployeeStatusResult> => {
          // The guard checked the caller before this request queued on the
          // lock; an administration that ran in between may have demoted or
          // deactivated it, so the caller is re-checked here.
          if (!(await tx.userHasPermission(context.userId, MANAGE_EMPLOYEES))) {
            return { kind: 'CALLER_NOT_ALLOWED' };
          }

          if (
            status !== 'ACTIVE' &&
            (await tx.userHasPermission(employeeId, MANAGE_EMPLOYEES)) &&
            (await tx.countActiveUsersWithPermission(MANAGE_EMPLOYEES)) <= 1
          ) {
            return { kind: 'LAST_ADMIN' };
          }

          // A user of another tenant is invisible here, so it is NOT_FOUND
          // (and never counted as an admin above).
          const found = await tx.setStatus(employeeId, status);
          return found ? { kind: 'OK' } : { kind: 'NOT_FOUND' };
        },
      );
    } catch (error) {
      if (error instanceof EmployeeAdministrationBusyError) {
        return { kind: 'BUSY' };
      }
      throw error;
    }

    // Revocation runs only after the status change committed: revoking first
    // could lock someone out of a change that then rolled back. If it fails
    // after the commit, the session still cannot act: session resolution
    // rejects a user who is not ACTIVE. Retrying the request is safe.
    if (result.kind === 'OK' && status !== 'ACTIVE') {
      await this.sessions.revokeAllForUser(context.tenantId, employeeId);
    }

    return result;
  }
}
