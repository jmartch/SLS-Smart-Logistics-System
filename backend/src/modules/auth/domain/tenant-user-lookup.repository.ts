export interface TenantLookup {
  readonly id: string;
  readonly status: 'ACTIVE' | 'SUSPENDED';
}

export interface UserForLogin {
  readonly id: string;
  readonly tenantId: string;
  readonly passwordHash: string;
  readonly status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  readonly permissions: readonly string[];
}

export interface RoleSummary {
  readonly id: string;
  readonly name: string;
}

// What /api/auth/me shows about a tenant user. Never carries credentials.
export interface TenantUserProfile {
  readonly email: string;
  readonly roles: readonly RoleSummary[];
}

export abstract class TenantUserLookupRepository {
  abstract findTenantBySlug(slug: string): Promise<TenantLookup | null>;
  abstract findUserForLogin(
    tenantId: string,
    email: string,
  ): Promise<UserForLogin | null>;
  // Permissions currently granted to the user, read fresh on every call.
  // null when the user may not act at all: the tenant is not ACTIVE, the user
  // is not ACTIVE, or the user does not exist in that tenant. An empty list
  // means an ACTIVE user without roles, which is still a valid actor.
  abstract findPermissionsForUser(
    tenantId: string,
    userId: string,
  ): Promise<readonly string[] | null>;
  // Email and roles of the user within the tenant (roles ordered by name), or
  // null when the user does not exist in that tenant.
  abstract findUserProfile(
    tenantId: string,
    userId: string,
  ): Promise<TenantUserProfile | null>;
}
