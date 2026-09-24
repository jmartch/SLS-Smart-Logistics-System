\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  tenant_id uuid := gen_random_uuid();
  dataset_a uuid := gen_random_uuid();
  dataset_b uuid := gen_random_uuid();
  address_id uuid := gen_random_uuid();
  reference_b uuid := gen_random_uuid();
  attempt_a uuid := gen_random_uuid();
  attempt_b uuid := gen_random_uuid();
  candidate_a uuid := gen_random_uuid();
  candidate_b uuid := gen_random_uuid();
  reviewer_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO "Tenant" ("id", "name")
  VALUES (tenant_id, 'Prueba de candidatos');

  INSERT INTO "GeoDataset" (
    "id", "name", "sourceType", "sourceReference",
    "sourceDate", "checksum", "license",
    "coverage", "importerVersion"
  )
  SELECT
    id, 'Dataset de prueba', 'SYNTHETIC', 'fixture',
    CURRENT_TIMESTAMP, repeat('a', 64),
    'Sintético', 'Prueba', 'test-1'
  FROM unnest(ARRAY[dataset_a, dataset_b]) AS datasets(id);

  INSERT INTO "Address" (
    "id", "tenantId", "originalText", "municipalityCode"
  )
  VALUES (address_id, tenant_id, 'Dirección sintética', '08001');

  INSERT INTO "AddressReference" (
    "id", "datasetId", "sourceRecordId", "municipalityCode",
    "streetType", "streetIdentifier", "normalizedAddress",
    "searchKey", "location", "precision"
  )
  VALUES (
    reference_b, dataset_b, 'ref-b', '08001',
    'CALLE', '1', 'CALLE 1', 'CALLE|1',
    ST_SetSRID(ST_MakePoint(-74.8, 11), 4326), 'STREET'
  );

  INSERT INTO "GeocodingAttempt" (
    "id", "tenantId", "addressId", "datasetId",
    "normalizedText", "components", "algorithmVersion", "status"
  )
  SELECT
    id, tenant_id, address_id, dataset_a,
    'DIRECCIÓN SINTÉTICA', '{}'::jsonb,
    'test-1', 'REVIEW_REQUIRED'
  FROM unnest(ARRAY[attempt_a, attempt_b]) AS attempts(id);

  INSERT INTO "GeocodingCandidate" (
    "id", "tenantId", "attemptId", "datasetId",
    "rank", "score", "scoreBreakdown",
    "source", "precision", "location"
  )
  VALUES
    (
      candidate_a, tenant_id, attempt_a, dataset_a,
      1, 0.95, '{}'::jsonb, 'fixture', 'ENTRANCE',
      ST_SetSRID(ST_MakePoint(-74.8, 11), 4326)
    ),
    (
      candidate_b, tenant_id, attempt_b, dataset_a,
      1, 0.90, '{}'::jsonb, 'fixture', 'ENTRANCE',
      ST_SetSRID(ST_MakePoint(-74.81, 11.01), 4326)
    );

  BEGIN
    UPDATE "GeocodingCandidate"
    SET "score" = 1.1
    WHERE "id" = candidate_a;

    RAISE EXCEPTION 'FAIL: aceptó score mayor que 1';
  EXCEPTION
    WHEN check_violation THEN
      RAISE NOTICE 'PASS: score inválido rechazado';
  END;

  BEGIN
    UPDATE "GeocodingCandidate"
    SET "rank" = 0
    WHERE "id" = candidate_a;

    RAISE EXCEPTION 'FAIL: aceptó rank cero';
  EXCEPTION
    WHEN check_violation THEN
      RAISE NOTICE 'PASS: rank inválido rechazado';
  END;

  BEGIN
    UPDATE "GeocodingCandidate"
    SET "addressReferenceId" = reference_b
    WHERE "id" = candidate_a;

    RAISE EXCEPTION 'FAIL: aceptó referencia de otro dataset';
  EXCEPTION
    WHEN foreign_key_violation THEN
      RAISE NOTICE 'PASS: referencia de otro dataset rechazada';
  END;

  BEGIN
    UPDATE "GeocodingAttempt"
    SET "selectedCandidateId" = candidate_b
    WHERE "id" = attempt_a;

    RAISE EXCEPTION 'FAIL: seleccionó candidato de otro intento';
  EXCEPTION
    WHEN foreign_key_violation THEN
      RAISE NOTICE 'PASS: candidato de otro intento rechazado';
  END;

  UPDATE "GeocodingAttempt"
  SET "selectedCandidateId" = candidate_a,
      "status" = 'MATCHED'
  WHERE "id" = attempt_a;

  IF NOT EXISTS (
    SELECT 1 FROM "GeocodingAttempt"
    WHERE "id" = attempt_a
      AND "selectedCandidateId" = candidate_a
      AND "status" = 'MATCHED'
  ) THEN
    RAISE EXCEPTION 'FAIL: selección válida no persistida';
  END IF;

  RAISE NOTICE 'PASS: selección válida aceptada';

    -- Preparación como administrador.
  INSERT INTO "User" (
    "id", "tenantId", "email", "passwordHash"
  )
  VALUES (
    reviewer_id, tenant_id,
    'reviewer@example.invalid', 'fixture-no-login'
  );

  UPDATE "GeoDataset"
  SET "status" = 'READY',
      "readyAt" = CURRENT_TIMESTAMP
  WHERE "id" = dataset_a;

  -- El dataset B permanece en STAGING.
  PERFORM set_config('app.tenant_id', tenant_id::text, true);

  EXECUTE 'SET LOCAL ROLE sls_app';

  IF NOT EXISTS (
    SELECT 1 FROM "GeoDataset" WHERE "id" = dataset_a
  ) THEN
    RAISE EXCEPTION 'FAIL: no puede consultar el dataset publicado';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "GeoDataset" WHERE "id" = dataset_b
  ) THEN
    RAISE EXCEPTION 'FAIL: puede consultar el dataset STAGING';
  END IF;

  RAISE NOTICE 'PASS: solo consulta datasets publicados';

  INSERT INTO "GeocodingReview" (
    "tenantId", "attemptId", "candidateId",
    "reviewerId", "decision", "reason"
  )
  VALUES (
    tenant_id, attempt_a, candidate_a,
    reviewer_id, 'APPROVED', 'Ubicación verificada en fixture'
  );

  UPDATE "GeocodingAttempt"
  SET "selectedCandidateId" = candidate_a,
      "status" = 'MATCHED'
  WHERE "id" = attempt_a;

  IF NOT EXISTS (
    SELECT 1 FROM "GeocodingReview"
    WHERE "tenantId" = tenant_id
      AND "attemptId" = attempt_a
      AND "candidateId" = candidate_a
      AND "reviewerId" = reviewer_id
      AND "decision" = 'APPROVED'
  ) THEN
    RAISE EXCEPTION 'FAIL: revisión no registrada';
  END IF;

  RAISE NOTICE 'PASS: runtime puede registrar revisión y selección';

  EXECUTE 'RESET ROLE';
END $$;

ROLLBACK;