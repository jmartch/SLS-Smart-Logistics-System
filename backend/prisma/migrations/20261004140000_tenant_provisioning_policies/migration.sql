-- Tenant provisioning (POST /api/platform/tenants) runs as sls_provisioning,
-- which holds SELECT/INSERT on "Tenant" (auth_platform_sessions) but is subject
-- to FORCE ROW LEVEL SECURITY and, until now, matched no "Tenant" policy: every
-- insert (and Prisma's RETURNING) was denied.
--
-- The provisioning transaction picks the new tenant's id up front and declares
-- it with set_config('app.tenant_id', <id>, true) before inserting. These two
-- policies let sls_provisioning insert and read back exactly that one tenant;
-- with the setting unset or empty, NULLIF yields NULL and nothing matches. The
-- child tables (User, Role, RolePermission, UserRole, AuditLog) already have
-- tenant_isolation policies for PUBLIC with the same expression in USING and
-- WITH CHECK, so they need no change.
CREATE POLICY tenant_provisioning_insert ON "Tenant" FOR INSERT TO sls_provisioning
  WITH CHECK (id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY tenant_provisioning_read ON "Tenant" FOR SELECT TO sls_provisioning
  USING (id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Slugs are the public login identifier; the application derives them as
-- lowercase ASCII letters/digits in hyphen-separated groups. The tenant_slug
-- backfill could produce a leading hyphen for a name without letters or
-- digits; such rows are rewritten deterministically before the constraint is
-- added so the migration cannot fail on existing data.
UPDATE "Tenant"
SET "slug" = 'tenant-' || substr("id"::text, 1, 8)
WHERE "slug" !~ '^[a-z0-9]+(-[a-z0-9]+)*$';

ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_slug_format_check"
  CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
