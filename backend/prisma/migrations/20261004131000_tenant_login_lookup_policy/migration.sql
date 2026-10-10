-- Tenant has FORCE RLS with tenant_self_read (id = app.tenant_id), so a login
-- request that only knows the tenant slug sees no row at all. This additive
-- policy lets sls_app resolve exactly the one tenant whose slug equals the
-- transaction-local app.login_tenant_slug setting. Empty or unset stays closed,
-- mirroring the NULLIF convention of the existing tenant policies.
CREATE POLICY tenant_login_lookup ON "Tenant" FOR SELECT TO sls_app
  USING (slug = NULLIF(current_setting('app.login_tenant_slug', true), ''));
