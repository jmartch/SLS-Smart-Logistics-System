BEGIN;

-- 1. Tabla de idempotencia DeliveryOperation
CREATE TABLE IF NOT EXISTS "DeliveryOperation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "requestId" TEXT NOT NULL,
    "actorUserId" UUID NOT NULL,
    "commandType" TEXT NOT NULL,
    "targetId" UUID NOT NULL,
    "requestHash" TEXT NOT NULL,
    "resultSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryOperation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DeliveryOperation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DeliveryOperation_tenantId_actorUserId_fkey" FOREIGN KEY ("tenantId", "actorUserId") REFERENCES "User"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "DeliveryOperation_tenantId_requestId_key" ON "DeliveryOperation"("tenantId", "requestId");
CREATE INDEX IF NOT EXISTS "DeliveryOperation_tenantId_idx" ON "DeliveryOperation"("tenantId");
CREATE INDEX IF NOT EXISTS "DeliveryOperation_tenantId_targetId_idx" ON "DeliveryOperation"("tenantId", "targetId");

-- 2. Horarios reales en paradas
ALTER TABLE "RouteStop" ADD COLUMN IF NOT EXISTS "actualArrivalAt" TIMESTAMPTZ(3);
ALTER TABLE "RouteStop" ADD COLUMN IF NOT EXISTS "actualServiceEndAt" TIMESTAMPTZ(3);

-- 3. Campos y cardinalidad D8 en DeliveryAttempt
ALTER TABLE "DeliveryAttempt" ADD COLUMN IF NOT EXISTS "routeId" UUID;
ALTER TABLE "DeliveryAttempt" ADD COLUMN IF NOT EXISTS "assignmentId" UUID;
ALTER TABLE "DeliveryAttempt" ADD COLUMN IF NOT EXISTS "failureReasonCode" TEXT;
ALTER TABLE "DeliveryAttempt" ADD COLUMN IF NOT EXISTS "latitude" DECIMAL(10, 6);
ALTER TABLE "DeliveryAttempt" ADD COLUMN IF NOT EXISTS "longitude" DECIMAL(10, 6);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryAttempt_tenantId_routeId_fkey'
    ) THEN
        ALTER TABLE "DeliveryAttempt"
        ADD CONSTRAINT "DeliveryAttempt_tenantId_routeId_fkey"
        FOREIGN KEY ("tenantId", "routeId") REFERENCES "Route"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- Reemplazar unicidad antigua por (tenantId, packageId, attemptNumber)
DROP INDEX IF EXISTS "DeliveryAttempt_routeStopId_attemptNumber_key";

CREATE UNIQUE INDEX IF NOT EXISTS "DeliveryAttempt_tenantId_packageId_attemptNumber_key"
ON "DeliveryAttempt"("tenantId", "packageId", "attemptNumber");

CREATE INDEX IF NOT EXISTS "DeliveryAttempt_tenantId_routeStopId_idx"
ON "DeliveryAttempt"("tenantId", "routeStopId");

-- 4. Metadatos de evidencia
ALTER TABLE "DeliveryEvidence" ADD COLUMN IF NOT EXISTS "byteSize" INTEGER;
ALTER TABLE "DeliveryEvidence" ADD COLUMN IF NOT EXISTS "mimeType" TEXT;

-- 5. RLS y Políticas para sls_app
ALTER TABLE "DeliveryOperation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeliveryOperation" FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'DeliveryOperation' AND policyname = 'tenant_isolation_policy'
    ) THEN
        CREATE POLICY tenant_isolation_policy ON "DeliveryOperation"
        FOR ALL
        TO sls_app
        USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
    END IF;
END $$;

-- Permisos de runtime
GRANT SELECT, INSERT, UPDATE, DELETE ON
  "DeliveryOperation",
  "DeliveryAttempt",
  "DeliveryEvidence",
  "Incident",
  "DeliveryWindow",
  "RouteStop",
  "Assignment",
  "Package",
  "Route",
  "AuditLog",
  "OutboxEvent"
TO sls_app;

COMMIT;