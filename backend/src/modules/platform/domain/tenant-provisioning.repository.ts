import type {
  ProvisionTenantInput,
  TenantProvisioningOutcome,
} from './provision-tenant.types';

export abstract class TenantProvisioningRepository {
  // Persists the tenant, its first administrator, the given role catalog, the
  // administrator's role bindings and the audit entry atomically. Resolves
  // SLUG_ALREADY_EXISTS when the slug is taken; any other failure rejects and
  // leaves nothing behind.
  abstract provision(
    input: ProvisionTenantInput,
  ): Promise<TenantProvisioningOutcome>;
}
