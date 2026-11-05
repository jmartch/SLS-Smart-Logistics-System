BEGIN;

-- 1. Campos de leasing y polling para OutboxEvent
ALTER TABLE "OutboxEvent" ADD COLUMN IF NOT EXISTS "producer" TEXT;
ALTER TABLE "OutboxEvent" ADD COLUMN IF NOT EXISTS "leaseToken" UUID;
ALTER TABLE "OutboxEvent" ADD COLUMN IF NOT EXISTS "lockedUntil" TIMESTAMP(3);
ALTER TABLE "OutboxEvent" ADD COLUMN IF NOT EXISTS "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "OutboxEvent" ADD COLUMN IF NOT EXISTS "lastError" TEXT;

CREATE INDEX IF NOT EXISTS "OutboxEvent_tenantId_status_nextAttemptAt_occurredAt_id_idx"
ON "OutboxEvent"("tenantId", "status", "nextAttemptAt", "occurredAt", "id");

-- 2. Clave de deduplicación y metadatos para DeadLetterMessage
ALTER TABLE "DeadLetterMessage" ADD COLUMN IF NOT EXISTS "failureKey" TEXT;
ALTER TABLE "DeadLetterMessage" ADD COLUMN IF NOT EXISTS "transportMetadata" JSONB;

UPDATE "DeadLetterMessage"
SET "failureKey" = 'legacy_' || gen_random_uuid()::text
WHERE "failureKey" IS NULL;

ALTER TABLE "DeadLetterMessage" ALTER COLUMN "failureKey" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "DeadLetterMessage_failureKey_key"
ON "DeadLetterMessage"("failureKey");

CREATE UNIQUE INDEX IF NOT EXISTS "DeadLetterMessage_tenantId_id_key"
ON "DeadLetterMessage"("tenantId", "id");

CREATE INDEX IF NOT EXISTS "DeadLetterMessage_tenantId_failedAt_id_idx"
ON "DeadLetterMessage"("tenantId", "failedAt", "id");

-- 3. Tabla y tipo DeadLetterRedrive
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DeadLetterRedriveStatus') THEN
        CREATE TYPE "DeadLetterRedriveStatus" AS ENUM ('PENDING', 'PUBLISHED', 'FAILED');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "DeadLetterRedrive" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "deadLetterMessageId" UUID NOT NULL,
    "consumerName" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "DeadLetterRedriveStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseToken" UUID,
    "lockedUntil" TIMESTAMP(3),
    "lastError" TEXT,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "DeadLetterRedrive_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DeadLetterRedrive_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DeadLetterRedrive_tenantId_deadLetterMessageId_fkey" FOREIGN KEY ("tenantId", "deadLetterMessageId") REFERENCES "DeadLetterMessage"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "DeadLetterRedrive_tenantId_id_key" ON "DeadLetterRedrive"("tenantId", "id");
CREATE INDEX IF NOT EXISTS "DeadLetterRedrive_tenantId_idx" ON "DeadLetterRedrive"("tenantId");
CREATE INDEX IF NOT EXISTS "DeadLetterRedrive_tenantId_status_nextAttemptAt_requestedAt_id_idx"
ON "DeadLetterRedrive"("tenantId", "status", "nextAttemptAt", "requestedAt", "id");

-- 4. RLS y políticas para DeadLetterRedrive y sls_app
ALTER TABLE "DeadLetterRedrive" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeadLetterRedrive" FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'DeadLetterRedrive' AND policyname = 'tenant_isolation_policy'
    ) THEN
        CREATE POLICY tenant_isolation_policy ON "DeadLetterRedrive"
        FOR ALL
        TO sls_app
        USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
    END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  "OutboxEvent",
  "ProcessedEvent",
  "DeadLetterMessage",
  "DeadLetterRedrive"
TO sls_app;

COMMIT;
