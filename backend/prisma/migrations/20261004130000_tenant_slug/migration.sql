-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "slug" TEXT;

-- Backfill existing tenants with a deterministic, lowercase [a-z0-9-] slug.
-- The id prefix keeps the slug unique even when two names normalize to the
-- same text, so the unique index below cannot fail on pre-existing data.
UPDATE "Tenant"
SET "slug" = trim(both '-' from lower(regexp_replace("name", '[^a-zA-Z0-9]+', '-', 'g')))
  || '-' || substr("id"::text, 1, 8)
WHERE "slug" IS NULL;

ALTER TABLE "Tenant" ALTER COLUMN "slug" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");
