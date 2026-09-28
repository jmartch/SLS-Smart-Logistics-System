BEGIN;

-- Exclusiones por recurso necesitan igualdad UUID en GiST.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- CreateEnum
CREATE TYPE "PlanningPackageOutcome" AS ENUM ('ASSIGNED', 'PENDING');

-- AlterTable
ALTER TABLE "Package" ADD COLUMN     "serviceDurationSeconds" INTEGER;

-- AlterTable
ALTER TABLE "RoutePlanningRequest" ADD COLUMN     "algorithm" TEXT,
ADD COLUMN     "algorithmVersion" TEXT,
ADD COLUMN     "datasetId" UUID,
ADD COLUMN     "datasetVersion" TEXT,
ADD COLUMN     "horizonEndAt" TIMESTAMPTZ(3),
ADD COLUMN     "horizonStartAt" TIMESTAMPTZ(3),
ADD COLUMN     "timeZone" TEXT;

-- AlterTable
ALTER TABLE "Route" ADD COLUMN     "depotId" UUID,
ADD COLUMN     "plannedDistanceM" DECIMAL(12,2),
ADD COLUMN     "plannedDurationS" INTEGER,
ADD COLUMN     "plannedEndAt" TIMESTAMPTZ(3),
ADD COLUMN     "plannedStartAt" TIMESTAMPTZ(3),
ADD COLUMN     "serviceDate" DATE;

-- AlterTable
ALTER TABLE "RouteStop" ADD COLUMN     "arrivalAt" TIMESTAMPTZ(3),
ADD COLUMN     "deliveryWindowId" UUID,
ADD COLUMN     "geocodingAttemptId" UUID,
ADD COLUMN     "serviceEndAt" TIMESTAMPTZ(3),
ADD COLUMN     "serviceStartAt" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "Depot" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "location" geometry(Point,4326) NOT NULL,
    "timeZone" TEXT NOT NULL,
    "openingHours" JSONB NOT NULL,

    CONSTRAINT "Depot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryWindow" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "packageId" UUID NOT NULL,
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DeliveryWindow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleShift" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "vehicleId" UUID NOT NULL,
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "VehicleShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourierShift" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "courierId" UUID NOT NULL,
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CourierShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanningPackageResult" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "planningRequestId" UUID NOT NULL,
    "packageId" UUID NOT NULL,
    "outcome" "PlanningPackageOutcome" NOT NULL,
    "reasonCode" TEXT,
    "evidence" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanningPackageResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Depot_tenantId_idx" ON "Depot"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Depot_tenantId_id_key" ON "Depot"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Depot_tenantId_name_key" ON "Depot"("tenantId", "name");

-- CreateIndex
CREATE INDEX "DeliveryWindow_tenantId_packageId_startAt_idx" ON "DeliveryWindow"("tenantId", "packageId", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryWindow_tenantId_id_key" ON "DeliveryWindow"("tenantId", "id");

-- CreateIndex
CREATE INDEX "VehicleShift_tenantId_vehicleId_startAt_idx" ON "VehicleShift"("tenantId", "vehicleId", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleShift_tenantId_id_key" ON "VehicleShift"("tenantId", "id");

-- CreateIndex
CREATE INDEX "CourierShift_tenantId_courierId_startAt_idx" ON "CourierShift"("tenantId", "courierId", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "CourierShift_tenantId_id_key" ON "CourierShift"("tenantId", "id");

-- CreateIndex
CREATE INDEX "PlanningPackageResult_tenantId_packageId_idx" ON "PlanningPackageResult"("tenantId", "packageId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanningPackageResult_tenantId_planningRequestId_packageId_key" ON "PlanningPackageResult"("tenantId", "planningRequestId", "packageId");

-- AddForeignKey
ALTER TABLE "Depot" ADD CONSTRAINT "Depot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryWindow" ADD CONSTRAINT "DeliveryWindow_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryWindow" ADD CONSTRAINT "DeliveryWindow_tenantId_packageId_fkey" FOREIGN KEY ("tenantId", "packageId") REFERENCES "Package"("tenantId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "VehicleShift" ADD CONSTRAINT "VehicleShift_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleShift" ADD CONSTRAINT "VehicleShift_tenantId_vehicleId_fkey" FOREIGN KEY ("tenantId", "vehicleId") REFERENCES "Vehicle"("tenantId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CourierShift" ADD CONSTRAINT "CourierShift_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierShift" ADD CONSTRAINT "CourierShift_tenantId_courierId_fkey" FOREIGN KEY ("tenantId", "courierId") REFERENCES "Courier"("tenantId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PlanningPackageResult" ADD CONSTRAINT "PlanningPackageResult_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanningPackageResult" ADD CONSTRAINT "PlanningPackageResult_tenantId_planningRequestId_fkey" FOREIGN KEY ("tenantId", "planningRequestId") REFERENCES "RoutePlanningRequest"("tenantId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PlanningPackageResult" ADD CONSTRAINT "PlanningPackageResult_tenantId_packageId_fkey" FOREIGN KEY ("tenantId", "packageId") REFERENCES "Package"("tenantId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RoutePlanningRequest" ADD CONSTRAINT "RoutePlanningRequest_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "GeoDataset"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Route" ADD CONSTRAINT "Route_tenantId_depotId_fkey" FOREIGN KEY ("tenantId", "depotId") REFERENCES "Depot"("tenantId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RouteStop" ADD CONSTRAINT "RouteStop_tenantId_geocodingAttemptId_fkey" FOREIGN KEY ("tenantId", "geocodingAttemptId") REFERENCES "GeocodingAttempt"("tenantId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RouteStop" ADD CONSTRAINT "RouteStop_tenantId_deliveryWindowId_fkey" FOREIGN KEY ("tenantId", "deliveryWindowId") REFERENCES "DeliveryWindow"("tenantId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "Package" ADD CONSTRAINT "Package_service_duration_positive_check"
  CHECK ("serviceDurationSeconds" IS NULL OR "serviceDurationSeconds" > 0);

ALTER TABLE "DeliveryWindow" ADD CONSTRAINT "DeliveryWindow_interval_check"
  CHECK ("startAt" < "endAt");
ALTER TABLE "VehicleShift" ADD CONSTRAINT "VehicleShift_interval_check"
  CHECK ("startAt" < "endAt");
ALTER TABLE "CourierShift" ADD CONSTRAINT "CourierShift_interval_check"
  CHECK ("startAt" < "endAt");

ALTER TABLE "VehicleShift" ADD CONSTRAINT "VehicleShift_no_overlap_excl"
  EXCLUDE USING gist ("tenantId" WITH =, "vehicleId" WITH =,
    tstzrange("startAt", "endAt", '[)') WITH &&);
ALTER TABLE "CourierShift" ADD CONSTRAINT "CourierShift_no_overlap_excl"
  EXCLUDE USING gist ("tenantId" WITH =, "courierId" WITH =,
    tstzrange("startAt", "endAt", '[)') WITH &&);

ALTER TABLE "RoutePlanningRequest" ADD CONSTRAINT "RoutePlanningRequest_horizon_check"
  CHECK ("horizonStartAt" IS NULL OR "horizonEndAt" IS NULL OR "horizonStartAt" < "horizonEndAt");
ALTER TABLE "Route" ADD CONSTRAINT "Route_planned_interval_check"
  CHECK ("plannedStartAt" IS NULL OR "plannedEndAt" IS NULL OR "plannedStartAt" < "plannedEndAt");
ALTER TABLE "Route" ADD CONSTRAINT "Route_planned_totals_check"
  CHECK (("plannedDistanceM" IS NULL OR ("plannedDistanceM" >= 0 AND "plannedDistanceM" < 'Infinity'::numeric))
    AND ("plannedDurationS" IS NULL OR "plannedDurationS" >= 0));
ALTER TABLE "RouteStop" ADD CONSTRAINT "RouteStop_planned_times_check"
  CHECK (("arrivalAt" IS NULL OR "serviceStartAt" IS NULL OR "arrivalAt" <= "serviceStartAt")
    AND ("serviceStartAt" IS NULL OR "serviceEndAt" IS NULL OR "serviceStartAt" < "serviceEndAt"));

-- V1: solo una ruta no cancelada por vehículo y fecha de servicio.
CREATE UNIQUE INDEX "Route_vehicle_service_day_active_key"
  ON "Route" ("tenantId", "vehicleId", "serviceDate")
  WHERE "serviceDate" IS NOT NULL AND "state" <> 'CANCELLED';

COMMIT;
