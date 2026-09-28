BEGIN;

-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_actorUserId_fkey";

-- DropForeignKey
ALTER TABLE "Sector" DROP CONSTRAINT "Sector_zoneId_fkey";

-- DropForeignKey
ALTER TABLE "DeliveryAttempt" DROP CONSTRAINT "DeliveryAttempt_routeStopId_fkey";

-- DropForeignKey
ALTER TABLE "DeliveryAttempt" DROP CONSTRAINT "DeliveryAttempt_packageId_fkey";

-- DropForeignKey
ALTER TABLE "DeliveryAttempt" DROP CONSTRAINT "DeliveryAttempt_courierId_fkey";

-- DropForeignKey
ALTER TABLE "DeliveryEvidence" DROP CONSTRAINT "DeliveryEvidence_deliveryAttemptId_fkey";

-- DropForeignKey
ALTER TABLE "Incident" DROP CONSTRAINT "Incident_routeId_fkey";

-- DropForeignKey
ALTER TABLE "Incident" DROP CONSTRAINT "Incident_routeStopId_fkey";

-- DropForeignKey
ALTER TABLE "Incident" DROP CONSTRAINT "Incident_packageId_fkey";

-- DropForeignKey
ALTER TABLE "Incident" DROP CONSTRAINT "Incident_reportedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "UserRole" DROP CONSTRAINT "UserRole_userId_fkey";

-- DropForeignKey
ALTER TABLE "UserRole" DROP CONSTRAINT "UserRole_roleId_fkey";

-- DropForeignKey
ALTER TABLE "RolePermission" DROP CONSTRAINT "RolePermission_roleId_fkey";

-- DropForeignKey
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_templateId_fkey";

-- DropForeignKey
ALTER TABLE "Package" DROP CONSTRAINT "Package_zoneId_fkey";

-- DropForeignKey
ALTER TABLE "Package" DROP CONSTRAINT "Package_sectorId_fkey";

-- DropForeignKey
ALTER TABLE "Package" DROP CONSTRAINT "Package_shipmentTypeId_fkey";

-- DropForeignKey
ALTER TABLE "PackageStatusHistory" DROP CONSTRAINT "PackageStatusHistory_packageId_fkey";

-- DropForeignKey
ALTER TABLE "PackageStatusHistory" DROP CONSTRAINT "PackageStatusHistory_changedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "Courier" DROP CONSTRAINT "Courier_userId_fkey";

-- DropForeignKey
ALTER TABLE "RoutePlanningRequest" DROP CONSTRAINT "RoutePlanningRequest_requestedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "Route" DROP CONSTRAINT "Route_planningRequestId_fkey";

-- DropForeignKey
ALTER TABLE "Route" DROP CONSTRAINT "Route_vehicleId_fkey";

-- DropForeignKey
ALTER TABLE "Route" DROP CONSTRAINT "Route_courierId_fkey";

-- DropForeignKey
ALTER TABLE "RouteStop" DROP CONSTRAINT "RouteStop_routeId_fkey";

-- DropForeignKey
ALTER TABLE "Assignment" DROP CONSTRAINT "Assignment_packageId_fkey";

-- DropForeignKey
ALTER TABLE "Assignment" DROP CONSTRAINT "Assignment_routeId_fkey";

-- DropForeignKey
ALTER TABLE "Assignment" DROP CONSTRAINT "Assignment_routeStopId_fkey";

-- DropForeignKey
ALTER TABLE "Assignment" DROP CONSTRAINT "Assignment_vehicleId_fkey";

-- DropForeignKey
ALTER TABLE "Assignment" DROP CONSTRAINT "Assignment_courierId_fkey";

-- DropForeignKey
ALTER TABLE "Assignment" DROP CONSTRAINT "Assignment_routingRuleId_fkey";

-- DropForeignKey
ALTER TABLE "Assignment" DROP CONSTRAINT "Assignment_responsibleUserId_fkey";

-- CreateIndex
CREATE UNIQUE INDEX "AuditLog_tenantId_id_key" ON "AuditLog"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Zone_tenantId_id_key" ON "Zone"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Sector_tenantId_id_key" ON "Sector"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Sector_tenantId_id_zoneId_key" ON "Sector"("tenantId", "id", "zoneId");

-- CreateIndex
CREATE UNIQUE INDEX "RoutingRule_tenantId_id_key" ON "RoutingRule"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ShipmentType_tenantId_id_key" ON "ShipmentType"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryAttempt_tenantId_id_key" ON "DeliveryAttempt"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_id_key" ON "User"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Role_tenantId_id_key" ON "Role"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationTemplate_tenantId_id_key" ON "NotificationTemplate"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Package_tenantId_id_key" ON "Package"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_tenantId_id_key" ON "Vehicle"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Courier_tenantId_id_key" ON "Courier"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Courier_tenantId_userId_key" ON "Courier"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "RoutePlanningRequest_tenantId_id_key" ON "RoutePlanningRequest"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Route_tenantId_id_key" ON "Route"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Route_tenantId_id_vehicleId_courierId_key" ON "Route"("tenantId", "id", "vehicleId", "courierId");

-- CreateIndex
CREATE UNIQUE INDEX "RouteStop_tenantId_id_key" ON "RouteStop"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "RouteStop_tenantId_id_routeId_key" ON "RouteStop"("tenantId", "id", "routeId");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_actorUserId_fkey" FOREIGN KEY ("tenantId", "actorUserId") REFERENCES "User"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sector" ADD CONSTRAINT "Sector_tenantId_zoneId_fkey" FOREIGN KEY ("tenantId", "zoneId") REFERENCES "Zone"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryAttempt" ADD CONSTRAINT "DeliveryAttempt_tenantId_routeStopId_fkey" FOREIGN KEY ("tenantId", "routeStopId") REFERENCES "RouteStop"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryAttempt" ADD CONSTRAINT "DeliveryAttempt_tenantId_packageId_fkey" FOREIGN KEY ("tenantId", "packageId") REFERENCES "Package"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryAttempt" ADD CONSTRAINT "DeliveryAttempt_tenantId_courierId_fkey" FOREIGN KEY ("tenantId", "courierId") REFERENCES "Courier"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryEvidence" ADD CONSTRAINT "DeliveryEvidence_tenantId_deliveryAttemptId_fkey" FOREIGN KEY ("tenantId", "deliveryAttemptId") REFERENCES "DeliveryAttempt"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_tenantId_routeId_fkey" FOREIGN KEY ("tenantId", "routeId") REFERENCES "Route"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_tenantId_routeStopId_fkey" FOREIGN KEY ("tenantId", "routeStopId") REFERENCES "RouteStop"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_tenantId_packageId_fkey" FOREIGN KEY ("tenantId", "packageId") REFERENCES "Package"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_tenantId_reportedByUserId_fkey" FOREIGN KEY ("tenantId", "reportedByUserId") REFERENCES "User"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_tenantId_userId_fkey" FOREIGN KEY ("tenantId", "userId") REFERENCES "User"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_tenantId_roleId_fkey" FOREIGN KEY ("tenantId", "roleId") REFERENCES "Role"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_tenantId_roleId_fkey" FOREIGN KEY ("tenantId", "roleId") REFERENCES "Role"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_tenantId_templateId_fkey" FOREIGN KEY ("tenantId", "templateId") REFERENCES "NotificationTemplate"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Package" ADD CONSTRAINT "Package_tenantId_zoneId_fkey" FOREIGN KEY ("tenantId", "zoneId") REFERENCES "Zone"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Package" ADD CONSTRAINT "Package_tenantId_sectorId_zoneId_fkey" FOREIGN KEY ("tenantId", "sectorId", "zoneId") REFERENCES "Sector"("tenantId", "id", "zoneId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Package" ADD CONSTRAINT "Package_tenantId_shipmentTypeId_fkey" FOREIGN KEY ("tenantId", "shipmentTypeId") REFERENCES "ShipmentType"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageStatusHistory" ADD CONSTRAINT "PackageStatusHistory_tenantId_packageId_fkey" FOREIGN KEY ("tenantId", "packageId") REFERENCES "Package"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageStatusHistory" ADD CONSTRAINT "PackageStatusHistory_tenantId_changedByUserId_fkey" FOREIGN KEY ("tenantId", "changedByUserId") REFERENCES "User"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Courier" ADD CONSTRAINT "Courier_tenantId_userId_fkey" FOREIGN KEY ("tenantId", "userId") REFERENCES "User"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutePlanningRequest" ADD CONSTRAINT "RoutePlanningRequest_tenantId_requestedByUserId_fkey" FOREIGN KEY ("tenantId", "requestedByUserId") REFERENCES "User"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Route" ADD CONSTRAINT "Route_tenantId_planningRequestId_fkey" FOREIGN KEY ("tenantId", "planningRequestId") REFERENCES "RoutePlanningRequest"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Route" ADD CONSTRAINT "Route_tenantId_vehicleId_fkey" FOREIGN KEY ("tenantId", "vehicleId") REFERENCES "Vehicle"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Route" ADD CONSTRAINT "Route_tenantId_courierId_fkey" FOREIGN KEY ("tenantId", "courierId") REFERENCES "Courier"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteStop" ADD CONSTRAINT "RouteStop_tenantId_routeId_fkey" FOREIGN KEY ("tenantId", "routeId") REFERENCES "Route"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_tenantId_packageId_fkey" FOREIGN KEY ("tenantId", "packageId") REFERENCES "Package"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_tenantId_routeId_vehicleId_courierId_fkey" FOREIGN KEY ("tenantId", "routeId", "vehicleId", "courierId") REFERENCES "Route"("tenantId", "id", "vehicleId", "courierId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_tenantId_routeStopId_routeId_fkey" FOREIGN KEY ("tenantId", "routeStopId", "routeId") REFERENCES "RouteStop"("tenantId", "id", "routeId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_tenantId_vehicleId_fkey" FOREIGN KEY ("tenantId", "vehicleId") REFERENCES "Vehicle"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_tenantId_courierId_fkey" FOREIGN KEY ("tenantId", "courierId") REFERENCES "Courier"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_tenantId_routingRuleId_fkey" FOREIGN KEY ("tenantId", "routingRuleId") REFERENCES "RoutingRule"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_tenantId_responsibleUserId_fkey" FOREIGN KEY ("tenantId", "responsibleUserId") REFERENCES "User"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- MATCH SIMPLE skips nullable composite keys; require full route context.
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_route_context_check" CHECK (
  ("routeId" IS NULL AND "vehicleId" IS NULL AND "courierId" IS NULL AND "routeStopId" IS NULL)
  OR ("routeId" IS NOT NULL AND "vehicleId" IS NOT NULL AND "courierId" IS NOT NULL)
);
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_active_route_check"
  CHECK (status <> 'ACTIVE' OR "routeId" IS NOT NULL);
ALTER TABLE "Package" ADD CONSTRAINT "Package_positive_capacity_check" CHECK (
  "weightKg" > 0 AND "weightKg" < 'Infinity'::numeric AND "volumeM3" > 0 AND "volumeM3" < 'Infinity'::numeric
);
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_positive_capacity_check" CHECK (
  "maxWeightKg" > 0 AND "maxWeightKg" < 'Infinity'::numeric AND "maxVolumeM3" > 0 AND "maxVolumeM3" < 'Infinity'::numeric
);
ALTER TABLE "Package" ADD CONSTRAINT "Package_coordinates_check"
  CHECK (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180);
ALTER TABLE "RouteStop" ADD CONSTRAINT "RouteStop_coordinates_check"
  CHECK (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180);
ALTER TABLE "RouteStop" ADD CONSTRAINT "RouteStop_sequence_check" CHECK (sequence > 0);
ALTER TABLE "DeliveryAttempt" ADD CONSTRAINT "DeliveryAttempt_number_check" CHECK ("attemptNumber" > 0);

REVOKE ALL ON TABLE "_prisma_migrations", "Tenant", "Permission" FROM sls_app;
GRANT SELECT ON TABLE "Tenant", "Permission" TO sls_app;
ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tenant" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_self_read ON "Tenant" FOR SELECT TO sls_app
  USING (id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM sls_app;

-- A pooled connection can retain an empty custom setting after SET LOCAL resets.
-- NULLIF keeps missing/empty context closed instead of raising an invalid UUID cast.
DO $$
DECLARE target record;
BEGIN
  FOR target IN
    SELECT tablename FROM pg_policies
    WHERE schemaname = 'public' AND policyname = 'tenant_isolation'
  LOOP
    EXECUTE format(
      $policy$ALTER POLICY tenant_isolation ON %I
      USING ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
      WITH CHECK ("tenantId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)$policy$,
      target.tablename
    );
  END LOOP;
END $$;
COMMIT;
