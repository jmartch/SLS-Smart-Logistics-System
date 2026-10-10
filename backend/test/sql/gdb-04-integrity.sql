\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  t uuid := gen_random_uuid();
  u uuid := gen_random_uuid();
  v uuid := gen_random_uuid();
  c uuid := gen_random_uuid();
  a uuid := gen_random_uuid();
  st uuid := gen_random_uuid();
  p uuid := gen_random_uuid();
  req uuid := gen_random_uuid();
  r uuid := gen_random_uuid();
  w uuid := gen_random_uuid();
  s uuid := gen_random_uuid();
BEGIN
  INSERT INTO "Tenant" ("id", "name", "slug")
  VALUES (t, 'GDB-04 integridad', 'gdb-04-integridad-' || t);
  INSERT INTO "User" ("id", "tenantId", "email", "passwordHash")
    VALUES (u, t, 'gdb04-integrity@example.test', 'fixture');
  INSERT INTO "Vehicle" ("id", "tenantId", "plate", "maxWeightKg", "maxVolumeM3")
    VALUES (v, t, 'GDB04-INT', 100, 1);
  INSERT INTO "Courier" ("id", "tenantId", "userId") VALUES (c, t, u);
  INSERT INTO "Address" ("id", "tenantId", "originalText", "municipalityCode")
    VALUES (a, t, 'Dirección sintética', '08001');
  INSERT INTO "ShipmentType" ("id", "tenantId", "code", "name")
    VALUES (st, t, 'GDB04INT', 'Prueba');
  INSERT INTO "Package" ("id", "tenantId", "addressId", "shipmentTypeId",
    "trackingCode", "publicTrackingToken", "weightKg", "lengthCm",
    "widthCm", "heightCm", "volumeM3")
    VALUES (p, t, a, st, 'GDB04INT', p::text, 1, 10, 10, 10, 0.001);
  INSERT INTO "RoutePlanningRequest" ("id", "tenantId", "requestedByUserId", "parameters")
    VALUES (req, t, u, '{}'::jsonb);
  INSERT INTO "Route" ("id", "tenantId", "planningRequestId", "vehicleId", "courierId")
    VALUES (r, t, req, v, c);

  BEGIN
    INSERT INTO "PlanningPackageResult" ("tenantId", "planningRequestId", "packageId",
      "outcome", "evidence") VALUES (t, req, p, 'PENDING', '{}'::jsonb);
    RAISE EXCEPTION 'FAIL: pendiente sin motivo';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: pendiente sin motivo rechazado';
  END;
  INSERT INTO "PlanningPackageResult" ("tenantId", "planningRequestId", "packageId",
    "outcome", "reasonCode", "evidence")
    VALUES (t, req, p, 'PENDING', 'NO_WINDOW', '{}'::jsonb);
  RAISE NOTICE 'PASS: pendiente con motivo aceptado';

  INSERT INTO "DeliveryWindow" ("id", "tenantId", "packageId", "startAt", "endAt")
    VALUES (w, t, p, '2026-09-16 08:00+00', '2026-09-16 09:00+00');
  BEGIN
    INSERT INTO "RouteStop" ("tenantId", "routeId", "sequence", "latitude", "longitude",
      "deliveryWindowId") VALUES (t, r, 1, 10.9, -74.8, w);
    RAISE EXCEPTION 'FAIL: ventana elegida sin servicio';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: ventana elegida exige servicio completo';
  END;
  INSERT INTO "RouteStop" ("id", "tenantId", "routeId", "sequence", "latitude",
    "longitude", "deliveryWindowId", "arrivalAt", "serviceStartAt", "serviceEndAt")
    VALUES (s, t, r, 1, 10.9, -74.8, w,
      '2026-09-16 07:55+00', '2026-09-16 08:00+00', '2026-09-16 08:10+00');
  RAISE NOTICE 'PASS: llegada temprana con servicio dentro de ventana';

  BEGIN
    UPDATE "RouteStop" SET "serviceEndAt" = '2026-09-16 09:01+00' WHERE "id" = s;
    RAISE EXCEPTION 'FAIL: fin de servicio tardío';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: fin de servicio tardío rechazado';
  END;
  BEGIN
    UPDATE "RouteStop" SET "serviceStartAt" = '2026-09-16 07:59+00' WHERE "id" = s;
    RAISE EXCEPTION 'FAIL: inicio de servicio temprano';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: inicio de servicio temprano rechazado';
  END;
  BEGIN
    UPDATE "DeliveryWindow" SET "endAt" = '2026-09-16 08:05+00' WHERE "id" = w;
    RAISE EXCEPTION 'FAIL: reducción invalidó parada existente';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: edición de ventana que invalida parada rechazada';
  END;
END $$;

ROLLBACK;
