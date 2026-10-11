import { Injectable } from '@nestjs/common';
import { UserManagementRepository } from '../domain/user-management.repository';
import {
  EmployeeAdministrationBusyError,
  EmployeeEmailAlreadyExistsError,
  MANAGE_EMPLOYEES,
  type EmployeeRecord,
} from '../domain/employee';
import { hashPassword } from '../../auth/domain/password-hasher';
import type { TenantContext } from '../../../shared/application/tenant-context';

export interface CreateEmployeeCommand {
  readonly email: string;
  readonly password: string;
  readonly roleIds: readonly string[];
}

export type CreateEmployeeResult =
  | { readonly kind: 'OK'; readonly employee: EmployeeRecord }
  | { readonly kind: 'ROLE_NOT_IN_TENANT' }
  | { readonly kind: 'EMAIL_ALREADY_EXISTS' }
  | { readonly kind: 'CALLER_NOT_ALLOWED' }
  | { readonly kind: 'BUSY' };

@Injectable()
export class CreateEmployeeService {
  constructor(private readonly repository: UserManagementRepository) {}

  async create(
    context: TenantContext,
    command: CreateEmployeeCommand,
  ): Promise<CreateEmployeeResult> {
    // Login lookups are case-sensitive, so emails are stored normalized.
    const email = command.email.trim().toLowerCase();
    // Hashed before the exclusive section so the lock is not held during it.
    const passwordHash = await hashPassword(command.password);

    try {
      return await this.repository.runExclusive(
        context.tenantId,
        async (tx): Promise<CreateEmployeeResult> => {
          // Re-checked inside the lock: the caller may have been demoted
          // after the guard let this request through, and could otherwise
          // still create (even admin) accounts.
          if (!(await tx.userHasPermission(context.userId, MANAGE_EMPLOYEES))) {
            return { kind: 'CALLER_NOT_ALLOWED' };
          }

          if (!(await tx.rolesBelongToTenant(command.roleIds))) {
            return { kind: 'ROLE_NOT_IN_TENANT' };
          }

          // Email uniqueness is enforced by the database, not pre-checked.
          const employee = await tx.createUser(
            email,
            passwordHash,
            command.roleIds,
          );
          return { kind: 'OK', employee };
        },
      );
    } catch (error) {
      if (error instanceof EmployeeEmailAlreadyExistsError) {
        return { kind: 'EMAIL_ALREADY_EXISTS' };
      }
      if (error instanceof EmployeeAdministrationBusyError) {
        return { kind: 'BUSY' };
      }
      throw error;
    }
  }
}
