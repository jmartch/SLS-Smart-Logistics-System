-- CreateEnum
CREATE TYPE "SessionActorType" AS ENUM ('TENANT_USER', 'PLATFORM_ADMIN');

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN "actorPlatformAdminId" UUID;

-- CreateTable
CREATE TABLE "PlatformAdmin" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformAdmin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tokenHash" TEXT NOT NULL,
    "actorType" "SessionActorType" NOT NULL,
    "tenantId" UUID,
    "userId" UUID,
    "platformAdminId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformAdmin_email_key" ON "PlatformAdmin"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_platformAdminId_idx" ON "Session"("platformAdminId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorPlatformAdminId_fkey" FOREIGN KEY ("actorPlatformAdminId") REFERENCES "PlatformAdmin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_tenantId_userId_fkey" FOREIGN KEY ("tenantId", "userId") REFERENCES "User"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_platformAdminId_fkey" FOREIGN KEY ("platformAdminId") REFERENCES "PlatformAdmin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Actor coherence: a session belongs either to a tenant user (both tenantId
-- and userId set, platformAdminId null) or to a platform admin
-- (platformAdminId set, tenantId and userId null).
ALTER TABLE "Session" ADD CONSTRAINT "Session_actor_coherence_check" CHECK (
  ("actorType" = 'TENANT_USER' AND "tenantId" IS NOT NULL AND "userId" IS NOT NULL AND "platformAdminId" IS NULL)
  OR ("actorType" = 'PLATFORM_ADMIN' AND "platformAdminId" IS NOT NULL AND "tenantId" IS NULL AND "userId" IS NULL)
);

-- Six permissions the whole MVP enforces against (spec section 4.4).
INSERT INTO "Permission" (id, code, description) VALUES
  (gen_random_uuid(), 'MANAGE_TENANT', 'Administrar configuracion, empleados y roles de la empresa'),
  (gen_random_uuid(), 'MANAGE_EMPLOYEES', 'Alta, baja y asignacion de roles de empleados'),
  (gen_random_uuid(), 'REGISTER_PACKAGES', 'Registrar paquetes'),
  (gen_random_uuid(), 'CLASSIFY_PACKAGES', 'Clasificar paquetes'),
  (gen_random_uuid(), 'COORDINATE_ROUTES', 'Planificar, asignar y coordinar rutas'),
  (gen_random_uuid(), 'OPERATE_DELIVERIES', 'Registrar intentos, entregas e incidentes')
ON CONFLICT (code) DO NOTHING;

-- sls_app must never create tenants, permissions, or platform admins directly:
-- only the provisioning role does. RLS never covered Tenant/Permission because
-- neither has a tenantId column, so the table grant is the only guard.
-- ("Tenant"/"Permission" were already reduced to SELECT by logistics_integrity;
-- repeated here so this migration states its own invariant.)
REVOKE INSERT, UPDATE, DELETE ON "Tenant", "Permission" FROM sls_app;

-- Created without LOGIN/PASSWORD in versioned SQL so no environment inherits a
-- known credential from migration history. Operational bootstrap and disposable
-- test runners grant LOGIN and rotate the credential from environment secrets.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'sls_provisioning') THEN
    CREATE ROLE sls_provisioning NOLOGIN;
  END IF;
END
$$;

-- Least privilege: provisioning creates tenants, roles, role bindings, users and
-- audit rows; it only reads the seeded permission catalogue.
GRANT USAGE ON SCHEMA public TO sls_provisioning;
GRANT SELECT, INSERT ON "Tenant", "Role", "RolePermission", "UserRole", "AuditLog" TO sls_provisioning;
GRANT SELECT ON "Permission" TO sls_provisioning;
GRANT SELECT, INSERT ON "User" TO sls_provisioning;

-- Session and PlatformAdmin intentionally have no RLS policy (spec 4.2): a
-- session lookup by token happens before the tenant is known, so there is
-- nothing to SET LOCAL app.tenant_id to yet. Security comes from the token
-- being a 256-bit random value stored only as its SHA-256 hash.
GRANT SELECT, INSERT, UPDATE, DELETE ON "Session" TO sls_app;
GRANT SELECT ON "PlatformAdmin" TO sls_app;
REVOKE INSERT, UPDATE, DELETE ON "PlatformAdmin" FROM sls_app;
