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

// Raised by the repository when (tenant, email) is already taken. It is an
// exception rather than a return value because the failed insert aborts the
// surrounding transaction, which must therefore be unwound.
export class EmployeeEmailAlreadyExistsError extends Error {
  constructor() {
    super('An employee with this email already exists in the tenant');
    this.name = 'EmployeeEmailAlreadyExistsError';
  }
}

// Raised by the repository when a lock wait of the tenant's
// employee-administration section exceeded its bound (typically: another
// administration is holding the section). The transaction was rolled back,
// so nothing was written; the caller may retry.
export class EmployeeAdministrationBusyError extends Error {
  constructor() {
    super('Employee administration for the tenant is busy');
    this.name = 'EmployeeAdministrationBusyError';
  }
}
