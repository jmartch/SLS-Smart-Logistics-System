import type {
  EmployeeAuditEntry,
  EmployeeRecord,
  EmployeeStatus,
  RoleRecord,
} from './employee';

// Reads and writes bound to one tenant transaction that holds that tenant's
// employee-administration lock. Every method is scoped to the tenant given to
// runExclusive; ids of another tenant behave as nonexistent.
export interface UserManagementTx {
  // Throws EmployeeEmailAlreadyExistsError when the email is taken in the
  // tenant. Expects roles already checked with rolesBelongToTenant.
  createUser(
    email: string,
    passwordHash: string,
    roleIds: readonly string[],
  ): Promise<EmployeeRecord>;
  // True only for an ACTIVE user of the tenant holding the permission through
  // at least one role.
  userHasPermission(userId: string, permissionCode: string): Promise<boolean>;
  // Distinct ACTIVE users of the tenant holding the permission through any role.
  countActiveUsersWithPermission(permissionCode: string): Promise<number>;
  // True when every id is a role of the tenant (vacuously true for none).
  rolesBelongToTenant(roleIds: readonly string[]): Promise<boolean>;
  roleIdsGrantPermission(
    roleIds: readonly string[],
    permissionCode: string,
  ): Promise<boolean>;
  // False (and nothing written) when the user is not in the tenant.
  setStatus(userId: string, status: EmployeeStatus): Promise<boolean>;
  // Replaces all roles. False (and nothing written) when the user is not in
  // the tenant.
  setRoles(userId: string, roleIds: readonly string[]): Promise<boolean>;
  // Atomically records an employee administration audit event in the same
  // tenant transaction. Never stores passwords, hashes, or session tokens.
  recordAudit(entry: EmployeeAuditEntry): Promise<void>;
}

// INVARIANT: the last-admin rule (some ACTIVE user of the tenant keeps
// MANAGE_EMPLOYEES) and the caller re-check are only sound because every
// write that can change who holds that permission is serialized through
// runExclusive. Any code that writes, for a tenant, a User status, a UserRole
// row or a RolePermission row (including future role/permission editors and
// tenant provisioning-style tooling acting on an existing tenant) MUST do so
// inside runExclusive of that tenant, or the rule can be bypassed by a
// concurrent change. Creating a brand-new tenant is exempt: nothing else can
// administer it before it exists.
export abstract class UserManagementRepository {
  abstract list(tenantId: string): Promise<readonly EmployeeRecord[]>;

  abstract listRoles(tenantId: string): Promise<readonly RoleRecord[]>;

  // Runs `work` in a single transaction of the tenant, serialized with every
  // other runExclusive of the same tenant: decisions taken from its reads
  // still hold when its writes commit. Committed when `work` resolves, rolled
  // back when it throws. The transaction-bound repository must not escape it.
  // Lock waits are bounded: when the section cannot be entered in time (or a
  // lock wait inside it exceeds the bound), the transaction is rolled back and
  // the call rejects with EmployeeAdministrationBusyError.
  abstract runExclusive<T>(
    tenantId: string,
    work: (tx: UserManagementTx) => Promise<T>,
  ): Promise<T>;
}
