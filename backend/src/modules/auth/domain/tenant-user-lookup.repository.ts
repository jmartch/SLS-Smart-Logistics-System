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
}
