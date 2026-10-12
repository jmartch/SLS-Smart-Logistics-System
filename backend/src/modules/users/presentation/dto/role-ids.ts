// Uniqueness is checked case-insensitively: Postgres treats UUIDs that differ
// only in letter case as the same value.
export function roleIdIdentity(roleId: unknown): string {
  return String(roleId).toLowerCase();
}

// Bounds the work one request can ask for; tenants have a handful of roles.
export const MAX_ROLES_PER_EMPLOYEE = 20;
