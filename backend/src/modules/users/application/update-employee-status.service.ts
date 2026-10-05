import { Injectable } from '@nestjs/common';
import { UserManagementRepository } from '../domain/user-management.repository';
import { MANAGE_EMPLOYEES, type EmployeeStatus } from '../domain/employee';
import { SessionRepository } from '../../auth/domain/session.repository';
import type { TenantContext } from '../../../shared/application/tenant-context';

export type UpdateEmployeeStatusResult =
  | { readonly kind: 'OK' }
  | { readonly kind: 'LAST_ADMIN' }
  | { readonly kind: 'NOT_FOUND' };

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
    // Count, decision and write share one exclusive section: two concurrent
    // deactivations of the last two admins cannot both see "2 admins left".
    const result = await this.repository.runExclusive(
      context.tenantId,
      async (tx): Promise<UpdateEmployeeStatusResult> => {
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

    // Revocation runs only after the status change committed: revoking first
    // could lock someone out of a change that then rolled back. If it fails
    // after the commit, the user still carries no permissions (the guard
    // reloads them and requires ACTIVE) and retrying the request is safe.
    if (result.kind === 'OK' && status !== 'ACTIVE') {
      await this.sessions.revokeAllForUser(context.tenantId, employeeId);
    }

    return result;
  }
}
