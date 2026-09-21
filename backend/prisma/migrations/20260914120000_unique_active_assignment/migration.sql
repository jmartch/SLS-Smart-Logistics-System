-- Historical assignments may repeat; only ACTIVE assignments reserve a package.
-- Existing duplicates deliberately fail migration rather than discard history.
CREATE UNIQUE INDEX "Assignment_one_active_per_package_key"
ON "Assignment" ("tenantId", "packageId")
WHERE "status" = 'ACTIVE';
