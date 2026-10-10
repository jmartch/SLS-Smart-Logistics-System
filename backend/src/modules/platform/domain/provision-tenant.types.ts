export interface RoleDefinition {
  readonly name: string;
  readonly permissionCodes: readonly string[];
  // Whether the tenant's first administrator receives this role.
  readonly grantedToFirstAdmin: boolean;
}

// Everything the repository persists. Business decisions (slug, email
// normalization, password hashing, role catalog) are already made by the
// caller; the plain password never reaches this type.
export interface ProvisionTenantInput {
  readonly name: string;
  readonly slug: string;
  readonly adminEmail: string;
  readonly adminPasswordHash: string;
  readonly roles: readonly RoleDefinition[];
  readonly actorPlatformAdminId: string;
}

export type TenantProvisioningOutcome =
  | { readonly kind: 'OK'; readonly tenantId: string }
  | { readonly kind: 'SLUG_ALREADY_EXISTS' };

export type ProvisionTenantResult =
  | { readonly kind: 'OK'; readonly tenantId: string; readonly slug: string }
  | { readonly kind: 'SLUG_ALREADY_EXISTS' }
  | { readonly kind: 'INVALID_NAME' };
