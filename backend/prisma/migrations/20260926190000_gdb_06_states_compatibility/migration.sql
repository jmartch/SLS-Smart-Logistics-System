BEGIN;

-- Preserve Package and PackageStatusHistory values while adopting the
-- canonical lifecycle name.
ALTER TYPE "PackageState"
  RENAME VALUE 'ASSIGNED' TO 'ASSIGNED_TO_ROUTE';

ALTER TYPE "PackageState"
  ADD VALUE 'RETURN_PENDING' BEFORE 'RETURNED';

ALTER TYPE "PackageState"
  ADD VALUE 'CANCELLED' AFTER 'RETURNED';

-- Complete the route lifecycle without changing existing route states.
ALTER TYPE "RouteState"
  ADD VALUE 'DRAFT' BEFORE 'PLANNED';

ALTER TYPE "RouteState"
  ADD VALUE 'PLANNING' BEFORE 'PLANNED';

ALTER TYPE "RouteState"
  ADD VALUE 'READY' BEFORE 'IN_PROGRESS';

ALTER TYPE "RouteState"
  ADD VALUE 'PLANNING_FAILED' BEFORE 'CANCELLED';

ALTER TYPE "RouteState"
  ADD VALUE 'INTERRUPTED' BEFORE 'CANCELLED';

COMMIT;

-- PostgreSQL requires newly added enum values to be committed before they
-- can be used as column defaults.
BEGIN;

ALTER TABLE "Route"
  ALTER COLUMN "state" SET DEFAULT 'DRAFT';

COMMIT;