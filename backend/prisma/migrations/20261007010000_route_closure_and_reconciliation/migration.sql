BEGIN;

-- 1. Enums para cierre y manifiesto
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RouteClosureMode') THEN
        CREATE TYPE "RouteClosureMode" AS ENUM ('REGULAR', 'FORCED');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RouteManifestOutcome') THEN
        CREATE TYPE "RouteManifestOutcome" AS ENUM ('DELIVERED', 'FAILED', 'RESCHEDULED', 'RETURNED', 'PENDING');
    END IF;
END $$;

-- 2. Tabla RouteClosure
CREATE TABLE IF NOT EXISTS "RouteClosure" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "routeId" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "actorUserId" UUID NOT NULL,
    "requestHash" TEXT NOT NULL,
    "mode" "RouteClosureMode" NOT NULL,
    "reasonCode" TEXT,
    "notes" TEXT,
    "completedAt" TIMESTAMPTZ(3) NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "totalAssigned" INTEGER NOT NULL,
    "deliveredCount" INTEGER NOT NULL,
    "failedCount" INTEGER NOT NULL,
    "rescheduledCount" INTEGER NOT NULL,
    "returnedCount" INTEGER NOT NULL,
    "pendingCount" INTEGER NOT NULL,
    "resultSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RouteClosure_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RouteClosure_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RouteClosure_tenantId_routeId_fkey" FOREIGN KEY ("tenantId", "routeId") REFERENCES "Route"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RouteClosure_tenantId_actorUserId_fkey" FOREIGN KEY ("tenantId", "actorUserId") REFERENCES "User"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RouteClosure_counts_non_negative" CHECK (
        "totalAssigned" >= 0 AND
        "deliveredCount" >= 0 AND
        "failedCount" >= 0 AND
        "rescheduledCount" >= 0 AND
        "returnedCount" >= 0 AND
        "pendingCount" >= 0
    ),
    CONSTRAINT "RouteClosure_counts_sum_exact" CHECK (
        "totalAssigned" = "deliveredCount" + "failedCount" + "rescheduledCount" + "returnedCount" + "pendingCount"
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS "RouteClosure_tenantId_id_key" ON "RouteClosure"("tenantId", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "RouteClosure_tenantId_routeId_key" ON "RouteClosure"("tenantId", "routeId");
CREATE UNIQUE INDEX IF NOT EXISTS "RouteClosure_tenantId_requestId_key" ON "RouteClosure"("tenantId", "requestId");
CREATE INDEX IF NOT EXISTS "RouteClosure_tenantId_idx" ON "RouteClosure"("tenantId");
CREATE INDEX IF NOT EXISTS "RouteClosure_tenantId_actorUserId_idx" ON "RouteClosure"("tenantId", "actorUserId");

-- 3. Route.dispatchManifestSnapshot
ALTER TABLE "Route" ADD COLUMN IF NOT EXISTS "dispatchManifestSnapshot" JSONB;

-- 4. Assignment: routeOutcome y recepción en depósito
ALTER TABLE "Assignment" ADD COLUMN IF NOT EXISTS "routeOutcome" "RouteManifestOutcome";
ALTER TABLE "Assignment" ADD COLUMN IF NOT EXISTS "routeOutcomeAt" TIMESTAMPTZ(3);
ALTER TABLE "Assignment" ADD COLUMN IF NOT EXISTS "receivedAtDepotId" UUID;
ALTER TABLE "Assignment" ADD COLUMN IF NOT EXISTS "receivedAtDepotAt" TIMESTAMPTZ(3);
ALTER TABLE "Assignment" ADD COLUMN IF NOT EXISTS "receivedByUserId" UUID;

CREATE UNIQUE INDEX IF NOT EXISTS "Assignment_tenantId_id_key" ON "Assignment"("tenantId", "id");
CREATE INDEX IF NOT EXISTS "Assignment_tenantId_routeId_status_idx" ON "Assignment"("tenantId", "routeId", "status");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Assignment_tenantId_receivedAtDepotId_fkey'
    ) THEN
        ALTER TABLE "Assignment"
        ADD CONSTRAINT "Assignment_tenantId_receivedAtDepotId_fkey"
        FOREIGN KEY ("tenantId", "receivedAtDepotId") REFERENCES "Depot"("tenantId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Assignment_tenantId_receivedByUserId_fkey'
    ) THEN
        ALTER TABLE "Assignment"
        ADD CONSTRAINT "Assignment_tenantId_receivedByUserId_fkey"
        FOREIGN KEY ("tenantId", "receivedByUserId") REFERENCES "User"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- 5. DeliveryAttempt: FK tenant/assignment e índice para reconciliación
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryAttempt_tenantId_assignmentId_fkey'
    ) THEN
        ALTER TABLE "DeliveryAttempt"
        ADD CONSTRAINT "DeliveryAttempt_tenantId_assignmentId_fkey"
        FOREIGN KEY ("tenantId", "assignmentId") REFERENCES "Assignment"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "DeliveryAttempt_tenantId_routeId_assignmentId_attemptedAt_idx"
ON "DeliveryAttempt"("tenantId", "routeId", "assignmentId", "attemptedAt");

-- 6. OutboxEvent: producer
ALTER TABLE "OutboxEvent" ADD COLUMN IF NOT EXISTS "producer" TEXT;

-- 7. RLS y políticas para RouteClosure (Tenant isolation & Force RLS)
ALTER TABLE "RouteClosure" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RouteClosure" FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'RouteClosure' AND policyname = 'tenant_isolation_policy'
    ) THEN
        CREATE POLICY tenant_isolation_policy ON "RouteClosure"
        FOR ALL
        TO sls_app
        USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
    END IF;
END $$;

-- 8. Runtime permissions para sls_app (RouteClosure es append-only: SELECT, INSERT)
GRANT SELECT, INSERT ON "RouteClosure" TO sls_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  "Route",
  "Assignment",
  "DeliveryAttempt",
  "OutboxEvent"
TO sls_app;

COMMIT;
