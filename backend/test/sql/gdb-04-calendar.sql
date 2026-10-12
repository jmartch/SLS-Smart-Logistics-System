\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  tenant_id uuid := gen_random_uuid();
  other_tenant_id uuid := gen_random_uuid();
  user_id uuid := gen_random_uuid();
  vehicle_id uuid := gen_random_uuid();
  courier_id uuid := gen_random_uuid();
  depot_id uuid := gen_random_uuid();
  request_id uuid := gen_random_uuid();
  package_id uuid := gen_random_uuid();
  address_id uuid := gen_random_uuid();
  shipment_type_id uuid := gen_random_uuid();
  route_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO "Tenant" ("id", "name", "slug") VALUES
    (tenant_id, 'GDB-04', 'gdb-04-' || tenant_id),
    (other_tenant_id, 'GDB-04 otro tenant', 'gdb-04-other-' || other_tenant_id);
  INSERT INTO "User" ("id", "tenantId", "email", "passwordHash")
    VALUES (user_id, tenant_id, 'gdb04@example.test', 'fixture');
  INSERT INTO "Vehicle" ("id", "tenantId", "plate", "maxWeightKg", "maxVolumeM3")
    VALUES (vehicle_id, tenant_id, 'GDB04', 100, 1);
  INSERT INTO "Courier" ("id", "tenantId", "userId")
    VALUES (courier_id, tenant_id, user_id);
  INSERT INTO "Address" ("id", "tenantId", "originalText", "municipalityCode")
    VALUES (address_id, tenant_id, 'Dirección sintética', '08001');
  INSERT INTO "ShipmentType" ("id", "tenantId", "code", "name")
    VALUES (shipment_type_id, tenant_id, 'GDB04', 'Prueba');
  INSERT INTO "Package" ("id", "tenantId", "addressId", "shipmentTypeId",
    "trackingCode", "publicTrackingToken", "weightKg", "lengthCm",
    "widthCm", "heightCm", "volumeM3")
    VALUES (package_id, tenant_id, address_id, shipment_type_id,
      'GDB04', package_id::text, 1, 10, 10, 10, 0.001);

  UPDATE "Package" SET "serviceDurationSeconds" = 300 WHERE "id" = package_id;
  RAISE NOTICE 'PASS: duración de servicio positiva';
  BEGIN
    UPDATE "Package" SET "serviceDurationSeconds" = 0 WHERE "id" = package_id;
    RAISE EXCEPTION 'FAIL: aceptó duración cero';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: duración cero rechazada';
  END;

  INSERT INTO "DeliveryWindow" ("tenantId", "packageId", "startAt", "endAt")
    VALUES (tenant_id, package_id, '2026-09-16 08:00+00', '2026-09-16 09:00+00');
  INSERT INTO "DeliveryWindow" ("tenantId", "packageId", "startAt", "endAt")
    VALUES (tenant_id, package_id, '2026-09-17 08:00+00', '2026-09-17 09:00+00');
  RAISE NOTICE 'PASS: ventanas alternativas en días distintos';
  BEGIN
    INSERT INTO "DeliveryWindow" ("tenantId", "packageId", "startAt", "endAt")
      VALUES (tenant_id, package_id, '2026-09-16 10:00+00', '2026-09-16 10:00+00');
    RAISE EXCEPTION 'FAIL: aceptó ventana vacía';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: ventana vacía rechazada';
  END;
  BEGIN
    INSERT INTO "DeliveryWindow" ("tenantId", "packageId", "startAt", "endAt")
      VALUES (other_tenant_id, package_id, '2026-09-16 10:00+00', '2026-09-16 11:00+00');
    RAISE EXCEPTION 'FAIL: aceptó paquete de otro tenant';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'PASS: ventana de otro tenant rechazada';
  END;

  INSERT INTO "VehicleShift" ("tenantId", "vehicleId", "startAt", "endAt")
    VALUES (tenant_id, vehicle_id, '2026-09-16 08:00+00', '2026-09-16 12:00+00');
  INSERT INTO "VehicleShift" ("tenantId", "vehicleId", "startAt", "endAt")
    VALUES (tenant_id, vehicle_id, '2026-09-16 12:00+00', '2026-09-16 16:00+00');
  RAISE NOTICE 'PASS: turnos adyacentes del vehículo permitidos';
  BEGIN
    INSERT INTO "VehicleShift" ("tenantId", "vehicleId", "startAt", "endAt")
      VALUES (tenant_id, vehicle_id, '2026-09-16 11:00+00', '2026-09-16 13:00+00');
    RAISE EXCEPTION 'FAIL: aceptó turno de vehículo solapado';
  EXCEPTION WHEN exclusion_violation THEN
    RAISE NOTICE 'PASS: turno de vehículo solapado rechazado';
  END;

  INSERT INTO "CourierShift" ("tenantId", "courierId", "startAt", "endAt")
    VALUES (tenant_id, courier_id, '2026-09-16 08:00+00', '2026-09-16 12:00+00');
  BEGIN
    INSERT INTO "CourierShift" ("tenantId", "courierId", "startAt", "endAt")
      VALUES (tenant_id, courier_id, '2026-09-16 11:00+00', '2026-09-16 13:00+00');
    RAISE EXCEPTION 'FAIL: aceptó turno de mensajero solapado';
  EXCEPTION WHEN exclusion_violation THEN
    RAISE NOTICE 'PASS: turno de mensajero solapado rechazado';
  END;

  INSERT INTO "Depot" ("id", "tenantId", "name", "location", "timeZone", "openingHours")
    VALUES (depot_id, tenant_id, 'Principal', ST_SetSRID(ST_MakePoint(-74.8, 10.9), 4326),
      'America/Bogota', '{}'::jsonb);
  INSERT INTO "RoutePlanningRequest" ("id", "tenantId", "requestedByUserId", "parameters")
    VALUES (request_id, tenant_id, user_id, '{}'::jsonb);
  BEGIN
    UPDATE "RoutePlanningRequest" SET "horizonStartAt" = '2026-09-17 08:00+00',
      "horizonEndAt" = '2026-09-16 08:00+00' WHERE "id" = request_id;
    RAISE EXCEPTION 'FAIL: aceptó horizonte invertido';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: horizonte invertido rechazado';
  END;
  INSERT INTO "PlanningPackageResult" ("tenantId", "planningRequestId", "packageId",
    "outcome", "reasonCode", "evidence")
    VALUES (tenant_id, request_id, package_id, 'PENDING', 'NO_CAPACITY', '{}'::jsonb);
  BEGIN
    INSERT INTO "PlanningPackageResult" ("tenantId", "planningRequestId", "packageId",
      "outcome", "evidence")
      VALUES (tenant_id, request_id, package_id, 'ASSIGNED', '{}'::jsonb);
    RAISE EXCEPTION 'FAIL: aceptó segundo resultado del mismo paquete y solicitud';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'PASS: resultado único por solicitud y paquete';
  END;
  INSERT INTO "Route" ("id", "tenantId", "planningRequestId", "vehicleId", "courierId",
    "depotId", "serviceDate")
    VALUES (route_id, tenant_id, request_id, vehicle_id, courier_id, depot_id, '2026-09-16');
  INSERT INTO "RouteStop" ("tenantId", "routeId", "sequence", "latitude", "longitude",
    "arrivalAt", "serviceStartAt", "serviceEndAt")
    VALUES (tenant_id, route_id, 1, 10.9, -74.8,
      '2026-09-16 08:00+00', '2026-09-16 08:05+00', '2026-09-16 08:10+00');
  RAISE NOTICE 'PASS: espera temprana representable en parada';
  BEGIN
    UPDATE "RouteStop" SET "serviceEndAt" = '2026-09-16 08:04+00'
      WHERE "routeId" = route_id;
    RAISE EXCEPTION 'FAIL: aceptó fin de servicio antes del inicio';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: tiempos de servicio invertidos rechazados';
  END;
  BEGIN
    INSERT INTO "Route" ("tenantId", "planningRequestId", "vehicleId", "courierId",
      "depotId", "serviceDate")
      VALUES (tenant_id, request_id, vehicle_id, courier_id, depot_id, '2026-09-16');
    RAISE EXCEPTION 'FAIL: aceptó segunda ruta del mismo vehículo y día';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'PASS: segunda ruta del mismo vehículo y día rechazada';
  END;
  INSERT INTO "Route" ("tenantId", "planningRequestId", "vehicleId", "courierId",
    "depotId", "serviceDate", "state")
    VALUES (tenant_id, request_id, vehicle_id, courier_id, depot_id, '2026-09-16', 'CANCELLED');
  RAISE NOTICE 'PASS: ruta cancelada no bloquea día';
END $$;

ROLLBACK;
