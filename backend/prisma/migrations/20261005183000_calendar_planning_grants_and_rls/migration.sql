BEGIN;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'Depot',
    'DeliveryWindow',
    'VehicleShift',
    'CourierShift',
    'PlanningPackageResult'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      $policy$
      CREATE POLICY tenant_isolation ON %I
      FOR ALL TO sls_app
      USING (
        "tenantId" =
        NULLIF(current_setting('app.tenant_id', true), '')::uuid
      )
      WITH CHECK (
        "tenantId" =
        NULLIF(current_setting('app.tenant_id', true), '')::uuid
      )
      $policy$,
      table_name
    );
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  "Depot",
  "DeliveryWindow",
  "VehicleShift",
  "CourierShift",
  "PlanningPackageResult"
TO sls_app;

COMMIT;
