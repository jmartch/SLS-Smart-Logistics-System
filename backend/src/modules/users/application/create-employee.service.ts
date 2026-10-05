import { Injectable } from '@nestjs/common';
import { UserManagementRepository } from '../domain/user-management.repository';
import {
  EmployeeEmailAlreadyExistsError,
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
  | { readonly kind: 'EMAIL_ALREADY_EXISTS' };

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
      throw error;
    }
  }
}
