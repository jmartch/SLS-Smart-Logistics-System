\set ON_ERROR_STOP on

BEGIN;

-- Datos sintéticos creados como administrador.
INSERT INTO "Tenant" ("id", "name")
VALUES
  ('10000000-0000-4000-8000-000000000001', 'Prueba A'),
  ('10000000-0000-4000-8000-000000000002', 'Prueba B');

INSERT INTO "Address" (
  "tenantId", "originalText", "municipalityCode"
)
VALUES
  ('10000000-0000-4000-8000-000000000001', 'Dirección A', '08001'),
  ('10000000-0000-4000-8000-000000000002', 'Dirección B', '08001');

-- Cambia al rol real de la aplicación.
SET LOCAL ROLE sls_app;

SELECT set_config(
  'app.tenant_id',
  '10000000-0000-4000-8000-000000000001',
  true
);

DO $$
BEGIN
  IF (SELECT count(*) FROM "Address") <> 1 THEN
    RAISE EXCEPTION 'FAIL: debe ver solamente una dirección';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "Address"
    WHERE "tenantId" <> '10000000-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'FAIL: puede leer otra empresa';
  END IF;

  RAISE NOTICE 'PASS: solo puede leer su empresa';

  BEGIN
    INSERT INTO "Address" (
      "tenantId", "originalText", "municipalityCode"
    )
    VALUES (
      '10000000-0000-4000-8000-000000000002',
      'Escritura no permitida',
      '08001'
    );

    RAISE EXCEPTION 'FAIL: pudo insertar para otra empresa';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'PASS: escritura entre empresas rechazada';
  END;

  BEGIN
    DELETE FROM "GeoDataset" WHERE false;

    RAISE EXCEPTION 'FAIL: tiene permiso DELETE sobre el catálogo';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'PASS: catálogo protegido contra eliminación';
  END;
END $$;

-- Sin tenant, no debe ver direcciones.
SELECT set_config('app.tenant_id', '', true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Address") THEN
    RAISE EXCEPTION 'FAIL: puede leer sin contexto de empresa';
  END IF;

  RAISE NOTICE 'PASS: sin tenant no hay acceso a direcciones';
END $$;

ROLLBACK;