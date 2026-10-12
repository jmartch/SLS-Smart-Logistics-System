// The permission whose holders may administer employees. The last-admin rule
// is evaluated on this permission, not on a role name, so it keeps holding if
// a tenant reorganizes its roles (spec section 7).
export const MANAGE_EMPLOYEES = 'MANAGE_EMPLOYEES';

export type EmployeeStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

export const EMPLOYEE_STATUSES: readonly EmployeeStatus[] = [
  'ACTIVE',
  'INACTIVE',
  'SUSPENDED',
];

// Never carries credentials: this is what leaves the users module.
export interface EmployeeRecord {
  readonly id: string;
  readonly email: string;
  readonly status: EmployeeStatus;
  readonly roleIds: readonly string[];
}

export interface RoleRecord {
  readonly id: string;
  readonly name: string;
  readonly permissions: readonly string[];
}

export type EmployeeAuditAction =
  | 'EMPLOYEE_CREATED'
  | 'EMPLOYEE_STATUS_UPDATED'
  | 'EMPLOYEE_ROLES_UPDATED';

export interface EmployeeAuditEntry {
  readonly actorUserId: string;
  readonly action: EmployeeAuditAction;
  readonly targetUserId: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export abstract class UsersDomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// Raised by the repository when (tenant, email) is already taken. It is an
// exception rather than a return value because the failed insert aborts the
// surrounding transaction, which must therefore be unwound.
export class EmployeeEmailAlreadyExistsError extends UsersDomainError {
  readonly code = 'EMAIL_ALREADY_EXISTS';
  readonly field = 'email';

  constructor(
    message = 'An employee with this email already exists in the tenant',
  ) {
    super(message);
  }
}

// Raised by the repository when a lock wait of the tenant's
// employee-administration section exceeded its bound (typically: another
// administration is holding the section). The transaction was rolled back,
// so nothing was written; the caller may retry.
export class EmployeeAdministrationBusyError extends UsersDomainError {
  readonly code = 'SERVICE_BUSY';

  constructor(message = 'Employee administration for the tenant is busy') {
    super(message);
  }
}
