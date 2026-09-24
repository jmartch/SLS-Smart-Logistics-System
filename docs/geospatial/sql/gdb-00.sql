\set ON_ERROR_STOP on
\pset pager off
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '30s';
SELECT current_database(), current_user, current_setting('server_version') AS version, current_setting('TimeZone') AS timezone, current_setting('transaction_read_only') AS read_only;
SELECT extname, extversion FROM pg_extension ORDER BY extname;
SELECT migration_name, checksum, finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS rolled_back FROM "_prisma_migrations" ORDER BY migration_name;
SELECT format('SELECT %L AS table_name, count(*) AS rows FROM public.%I;', tablename, tablename)
FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY tablename
\gexec
SELECT c.relname, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced, pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname;
SELECT tablename, cmd, roles, qual, with_check FROM pg_policies WHERE schemaname='public' ORDER BY tablename;
SELECT rolname, rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname IN ('postgres','sls_app');
SELECT table_name, privilege_type FROM information_schema.role_table_grants WHERE grantee='sls_app' AND table_schema='public' ORDER BY table_name, privilege_type;
-- All declared single-column foreign keys whose parent and child own tenantId.
SELECT format('SELECT %L AS relation, count(*) AS cross_tenant_rows FROM public.%I child JOIN public.%I parent ON child.%I = parent.%I WHERE child."tenantId" IS DISTINCT FROM parent."tenantId";', k.conname, child.relname, parent.relname, ca.attname, pa.attname)
FROM pg_constraint k JOIN pg_class child ON child.oid=k.conrelid JOIN pg_class parent ON parent.oid=k.confrelid
JOIN pg_namespace ns ON ns.oid=child.relnamespace
JOIN pg_attribute ca ON ca.attrelid=child.oid AND ca.attnum=k.conkey[1]
JOIN pg_attribute pa ON pa.attrelid=parent.oid AND pa.attnum=k.confkey[1]
WHERE k.contype='f' AND ns.nspname='public' AND cardinality(k.conkey)=1
AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=child.oid AND a.attname='tenantId' AND NOT a.attisdropped)
AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=parent.oid AND a.attname='tenantId' AND NOT a.attisdropped)
ORDER BY k.conname
\gexec
SELECT 'duplicate_active_assignment_groups' AS check_name, count(*) AS violations FROM (SELECT "tenantId", "packageId" FROM "Assignment" WHERE status='ACTIVE' GROUP BY "tenantId", "packageId" HAVING count(*)>1) x
UNION ALL SELECT 'assignment_stop_route_mismatch', count(*) FROM "Assignment" a JOIN "RouteStop" s ON s.id=a."routeStopId" WHERE a."routeId" IS DISTINCT FROM s."routeId"
UNION ALL SELECT 'assignment_vehicle_mismatch', count(*) FROM "Assignment" a JOIN "Route" r ON r.id=a."routeId" WHERE a."vehicleId" IS NOT NULL AND a."vehicleId" IS DISTINCT FROM r."vehicleId"
UNION ALL SELECT 'assignment_courier_mismatch', count(*) FROM "Assignment" a JOIN "Route" r ON r.id=a."routeId" WHERE a."courierId" IS NOT NULL AND a."courierId" IS DISTINCT FROM r."courierId"
UNION ALL SELECT 'package_sector_zone_mismatch', count(*) FROM "Package" p JOIN "Sector" s ON s.id=p."sectorId" WHERE p."zoneId" IS DISTINCT FROM s."zoneId"
UNION ALL SELECT 'invalid_package_capacity', count(*) FROM "Package" WHERE NOT ("weightKg">0 AND "weightKg"<'Infinity'::numeric AND "volumeM3">0 AND "volumeM3"<'Infinity'::numeric)
UNION ALL SELECT 'invalid_vehicle_capacity', count(*) FROM "Vehicle" WHERE NOT ("maxWeightKg">0 AND "maxWeightKg"<'Infinity'::numeric AND "maxVolumeM3">0 AND "maxVolumeM3"<'Infinity'::numeric)
UNION ALL SELECT 'invalid_package_coordinates', count(*) FROM "Package" WHERE latitude NOT BETWEEN -90 AND 90 OR longitude NOT BETWEEN -180 AND 180
UNION ALL SELECT 'invalid_stop_coordinates_or_sequence', count(*) FROM "RouteStop" WHERE latitude NOT BETWEEN -90 AND 90 OR longitude NOT BETWEEN -180 AND 180 OR sequence<=0;
SELECT state, count(*) FROM "Package" GROUP BY state ORDER BY state;
SELECT state, count(*) FROM "Route" GROUP BY state ORDER BY state;
SELECT count(*) AS packages_with_deadline FROM "Package" WHERE deadline IS NOT NULL;
SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND data_type LIKE 'timestamp%' ORDER BY table_name,column_name;
SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname;
SELECT conname, convalidated, pg_get_constraintdef(oid) FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY conname;
-- Metadata/behavior probe only: no fixtures or writes.
SET LOCAL ROLE sls_app;
SELECT current_user AS runtime_role, current_setting('app.tenant_id', true) AS tenant_context, count(*) AS visible_packages_without_context FROM "Package";
RESET ROLE;
COMMIT;
