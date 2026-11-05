BEGIN;

-- Add resultSnapshot to RoutePlanningRequest for idempotent replay preservation
ALTER TABLE "RoutePlanningRequest" ADD COLUMN IF NOT EXISTS "resultSnapshot" JSONB;

-- Add composite indexes on Route for operational list/filter queries
CREATE INDEX IF NOT EXISTS "Route_tenantId_state_plannedAt_idx" ON "Route"("tenantId", "state", "plannedAt");
CREATE INDEX IF NOT EXISTS "Route_tenantId_courierId_state_idx" ON "Route"("tenantId", "courierId", "state");

-- Ensure application runtime role permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON
  "RoutePlanningRequest",
  "Route",
  "RouteStop",
  "Assignment",
  "AuditLog",
  "OutboxEvent"
TO sls_app;

COMMIT;
