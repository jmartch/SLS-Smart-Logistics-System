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
}
