\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  dataset_id uuid := gen_random_uuid();
  reference_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO "GeoDataset" (
    "id", "name", "sourceType", "sourceReference",
    "sourceDate", "checksum", "license", "coverage",
    "importerVersion", "status", "readyAt"
  )
  VALUES (
    dataset_id, 'Prueba espacial', 'SYNTHETIC', 'fixture',
    CURRENT_TIMESTAMP, repeat('a', 64), 'Datos sintéticos',
    'Prueba Barranquilla', 'test-1', 'READY', CURRENT_TIMESTAMP
  );

  INSERT INTO "AddressReference" (
    "id", "datasetId", "sourceRecordId", "municipalityCode",
    "streetType", "streetIdentifier", "generatingRoad",
    "plateNumber", "normalizedAddress", "searchKey",
    "location", "precision"
  )
  VALUES (
    reference_id, dataset_id, 'test-1', '08001',
    'CARRERA', '53', '82', '15',
    'CARRERA 53 # 82-15', 'CARRERA|53|82|15',
    ST_SetSRID(ST_MakePoint(-74.8, 11), 4326), 'ENTRANCE'
  );

  -- Verifica que longitud y latitud no se inviertan.
  IF NOT EXISTS (
    SELECT 1
    FROM "AddressReference"
    WHERE "id" = reference_id
      AND ST_X("location") = -74.8
      AND ST_Y("location") = 11
      AND ST_SRID("location") = 4326
  ) THEN
    RAISE EXCEPTION 'FAIL: coordenadas o SRID incorrectos';
  END IF;

  -- Latitud fuera de rango: debe fallar.
  BEGIN
    UPDATE "AddressReference"
    SET "location" = ST_SetSRID(ST_MakePoint(-74.8, 91), 4326)
    WHERE "id" = reference_id;

    RAISE EXCEPTION 'FAIL: aceptó latitud 91';
  EXCEPTION
    WHEN check_violation THEN
      RAISE NOTICE 'PASS: latitud inválida rechazada';
  END;

  -- Un punto vacío también debe fallar.
  BEGIN
    UPDATE "AddressReference"
    SET "location" = ST_GeomFromText('POINT EMPTY', 4326)
    WHERE "id" = reference_id;

    RAISE EXCEPTION 'FAIL: aceptó un punto vacío';
  EXCEPTION
    WHEN check_violation THEN
      RAISE NOTICE 'PASS: punto vacío rechazado';
  END;

  RAISE NOTICE 'PASS: ubicación válida almacenada correctamente';
END $$;

ROLLBACK;