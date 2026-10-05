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
  // Permissions currently granted to the user. Empty unless the user exists in
  // the tenant and is ACTIVE, so a session that outlived a deactivation or
  // suspension carries no authority.
  abstract findPermissionsForUser(
    tenantId: string,
    userId: string,
  ): Promise<readonly string[]>;
}
