\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  tenant_id uuid := gen_random_uuid();
  address_id uuid := gen_random_uuid();
  shipment_type_id uuid := gen_random_uuid();
  package_id uuid := gen_random_uuid();
  other_tenant_id uuid := gen_random_uuid();
  other_address_id uuid := gen_random_uuid();
  second_address_id uuid := gen_random_uuid();
  dataset_id uuid := gen_random_uuid();
  attempt_id uuid := gen_random_uuid();
  zone_id uuid := gen_random_uuid();
  sector_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO "Tenant" ("id", "name")
  VALUES (tenant_id, 'Prueba GDB-03');

  INSERT INTO "Address" (
    "id", "tenantId", "originalText", "municipalityCode"
  )
  VALUES (
    address_id, tenant_id, 'Dirección sintética', '08001'
  );

  INSERT INTO "ShipmentType" (
    "id", "tenantId", "code", "name"
  )
  VALUES (
    shipment_type_id, tenant_id, 'TEST', 'Prueba'
  );

  INSERT INTO "Package" (
    "id", "tenantId", "addressId", "shipmentTypeId",
    "trackingCode", "publicTrackingToken",
    "weightKg", "lengthCm", "widthCm", "heightCm", "volumeM3"
  )
  VALUES (
    package_id, tenant_id, address_id, shipment_type_id,
    'TEST-01', package_id::text,
    1, 10, 10, 5, 0.000500
  );

  IF NOT EXISTS (
    SELECT 1 FROM "Package"
    WHERE "id" = package_id
      AND "zoneId" IS NULL
      AND "geocodingAttemptId" IS NULL
      AND "state" = 'REGISTERED'
      AND "volumeM3" = 0.000500
  ) THEN
    RAISE EXCEPTION 'FAIL: registro sin geocódigo incorrecto';
  END IF;

  RAISE NOTICE 'PASS: paquete registrado sin zona ni geocódigo';

  BEGIN
    UPDATE "Package"
    SET "volumeM3" = 0.001
    WHERE "id" = package_id;

    RAISE EXCEPTION 'FAIL: aceptó volumen contradictorio';
  EXCEPTION
    WHEN check_violation THEN
      RAISE NOTICE 'PASS: volumen contradictorio rechazado';
  END;

  BEGIN
    UPDATE "Package"
    SET "lengthCm" = 0
    WHERE "id" = package_id;

    RAISE EXCEPTION 'FAIL: aceptó dimensión cero';
  EXCEPTION
    WHEN check_violation THEN
      RAISE NOTICE 'PASS: dimensión cero rechazada';
  END;

  UPDATE "Package"
  SET "heightCm" = 10,
      "volumeM3" = 0.001
  WHERE "id" = package_id;

  IF NOT EXISTS (
    SELECT 1 FROM "Package"
    WHERE "id" = package_id
      AND "heightCm" = 10
      AND "volumeM3" = 0.001
  ) THEN
    RAISE EXCEPTION 'FAIL: actualización coherente no persistida';
  END IF;

  RAISE NOTICE 'PASS: dimensiones y volumen actualizados coherentemente';

    INSERT INTO "Tenant" ("id", "name")
  VALUES (other_tenant_id, 'Otra empresa de prueba');

  INSERT INTO "Address" (
    "id", "tenantId", "originalText", "municipalityCode"
  )
  VALUES
    (other_address_id, other_tenant_id, 'Otra empresa', '08001'),
    (second_address_id, tenant_id, 'Otra dirección propia', '08001');

  BEGIN
    UPDATE "Package"
    SET "addressId" = other_address_id
    WHERE "id" = package_id;

    RAISE EXCEPTION 'FAIL: aceptó dirección de otra empresa';
  EXCEPTION
    WHEN foreign_key_violation THEN
      RAISE NOTICE 'PASS: dirección de otra empresa rechazada';
  END;

  INSERT INTO "GeoDataset" (
    "id", "name", "sourceType", "sourceReference",
    "sourceDate", "checksum", "license",
    "coverage", "importerVersion"
  )
  VALUES (
    dataset_id, 'Fixture', 'SYNTHETIC', 'fixture',
    CURRENT_TIMESTAMP, repeat('a', 64),
    'Sintético', 'Prueba', 'test-1'
  );

  INSERT INTO "GeocodingAttempt" (
    "id", "tenantId", "addressId", "datasetId",
    "normalizedText", "components", "algorithmVersion", "status"
  )
  VALUES (
    attempt_id, tenant_id, second_address_id, dataset_id,
    'OTRA DIRECCIÓN PROPIA', '{}'::jsonb,
    'test-1', 'NOT_FOUND'
  );

  BEGIN
    UPDATE "Package"
    SET "geocodingAttemptId" = attempt_id
    WHERE "id" = package_id;

    RAISE EXCEPTION 'FAIL: aceptó intento de otra dirección';
  EXCEPTION
    WHEN foreign_key_violation THEN
      RAISE NOTICE 'PASS: intento de otra dirección rechazado';
  END;

  -- Cambiar dirección e intento juntos mantiene la coherencia.
  UPDATE "Package"
  SET "addressId" = second_address_id,
      "geocodingAttemptId" = attempt_id
  WHERE "id" = package_id;

  IF NOT EXISTS (
    SELECT 1 FROM "Package"
    WHERE "id" = package_id
      AND "addressId" = second_address_id
      AND "geocodingAttemptId" = attempt_id
  ) THEN
    RAISE EXCEPTION 'FAIL: relación válida no persistida';
  END IF;

  RAISE NOTICE 'PASS: dirección e intento compatibles aceptados';

  INSERT INTO "Zone" ("id", "tenantId", "code", "name")
  VALUES (zone_id, tenant_id, 'TEST', 'Zona de prueba');

  INSERT INTO "Sector" (
    "id", "tenantId", "zoneId", "code", "name"
  )
  VALUES (
    sector_id, tenant_id, zone_id, 'TEST', 'Sector de prueba'
  );

  BEGIN
    UPDATE "Package"
    SET "sectorId" = sector_id
    WHERE "id" = package_id;

    RAISE EXCEPTION 'FAIL: aceptó sector sin zona';
  EXCEPTION
    WHEN check_violation THEN
      RAISE NOTICE 'PASS: sector sin zona rechazado';
  END;

  UPDATE "Package"
  SET "zoneId" = zone_id,
      "sectorId" = sector_id
  WHERE "id" = package_id;

  IF NOT EXISTS (
    SELECT 1 FROM "Package"
    WHERE "id" = package_id
      AND "zoneId" = zone_id
      AND "sectorId" = sector_id
  ) THEN
    RAISE EXCEPTION 'FAIL: clasificación válida no persistida';
  END IF;

  RAISE NOTICE 'PASS: zona y sector compatibles aceptados';
END $$;

ROLLBACK;