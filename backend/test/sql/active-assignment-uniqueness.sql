\set ON_ERROR_STOP on
BEGIN;
-- Temporary table shadows the public table. No application data is modified.
CREATE TEMP TABLE "Assignment" (
  "tenantId" text NOT NULL,
  "packageId" text NOT NULL,
  "status" text NOT NULL
) ON COMMIT DROP;
SET LOCAL search_path = pg_temp;
\ir ../../prisma/migrations/20260914120000_unique_active_assignment/migration.sql
INSERT INTO "Assignment" VALUES ('A', 'P1', 'ACTIVE');
DO $$
BEGIN
  BEGIN
    INSERT INTO "Assignment" VALUES ('A', 'P1', 'ACTIVE');
    RAISE EXCEPTION 'Expected duplicate active assignment to fail';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END $$;
-- History remains repeatable; tenant and package identities are independent.
INSERT INTO "Assignment" VALUES
('A', 'P1', 'ENDED'), ('A', 'P1', 'ENDED'),
('A', 'P1', 'CANCELLED'), ('A', 'P1', 'CANCELLED'),
('B', 'P1', 'ACTIVE'), ('A', 'P2', 'ACTIVE');
DO $$
BEGIN
  BEGIN
    UPDATE "Assignment" SET status = 'ACTIVE'
    WHERE "tenantId" = 'A' AND "packageId" = 'P1' AND status = 'ENDED';
    RAISE EXCEPTION 'Expected reactivation conflict to fail';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END $$;
-- End and replace inside one transaction without losing history.
UPDATE "Assignment" SET status = 'ENDED'
WHERE "tenantId" = 'A' AND "packageId" = 'P1' AND status = 'ACTIVE';
INSERT INTO "Assignment" VALUES ('A', 'P1', 'ACTIVE');
DO $$
BEGIN
  IF (SELECT count(*) FROM "Assignment" WHERE "tenantId"='A' AND "packageId"='P1' AND status='ACTIVE') <> 1
     OR (SELECT count(*) FROM "Assignment" WHERE "tenantId"='A' AND "packageId"='P1' AND status='ENDED') <> 3 THEN
    RAISE EXCEPTION 'Replacement must preserve history and reserve once';
  END IF;
END $$;
ROLLBACK;
\echo 'PASS: duplicate insert/update rejected; history and replacement preserved.'
