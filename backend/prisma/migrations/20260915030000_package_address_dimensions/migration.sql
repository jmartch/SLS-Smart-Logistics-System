BEGIN;

LOCK TABLE "Package" IN ACCESS EXCLUSIVE MODE;

-- Esta migración está diseñada para Package vacío.
-- Evita eliminar coordenadas si se registraron datos entretanto.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Package") THEN
    RAISE EXCEPTION
      'Package contiene registros: se requiere migración de datos explícita';
  END IF;
END $$;

-- AlterTable
ALTER TABLE "Package" DROP COLUMN "latitude",
DROP COLUMN "longitude",
ADD COLUMN     "addressId" UUID NOT NULL,
ADD COLUMN     "geocodingAttemptId" UUID,
ADD COLUMN     "heightCm" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "lengthCm" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "widthCm" DECIMAL(10,2) NOT NULL,
ALTER COLUMN "zoneId" DROP NOT NULL,
ALTER COLUMN "volumeM3" SET DATA TYPE DECIMAL(12,6);

-- AlterTable
ALTER TABLE "Vehicle" ALTER COLUMN "maxVolumeM3" SET DATA TYPE DECIMAL(12,6);

-- CreateIndex
CREATE UNIQUE INDEX "GeocodingAttempt_tenantId_id_addressId_key" ON "GeocodingAttempt"("tenantId", "id", "addressId");

-- AddForeignKey
ALTER TABLE "Package" ADD CONSTRAINT "Package_tenantId_addressId_fkey" FOREIGN KEY ("tenantId", "addressId") REFERENCES "Address"("tenantId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Package" ADD CONSTRAINT "Package_tenantId_geocodingAttemptId_addressId_fkey" FOREIGN KEY ("tenantId", "geocodingAttemptId", "addressId") REFERENCES "GeocodingAttempt"("tenantId", "id", "addressId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Dimensiones positivas y finitas.
ALTER TABLE "Package"
ADD CONSTRAINT "Package_dimensions_check"
CHECK (
  "lengthCm" > 0 AND "lengthCm" < 'Infinity'::numeric
  AND "widthCm" > 0 AND "widthCm" < 'Infinity'::numeric
  AND "heightCm" > 0 AND "heightCm" < 'Infinity'::numeric
);

-- Volumen coherente con dimensiones en centímetros.
ALTER TABLE "Package"
ADD CONSTRAINT "Package_calculated_volume_check"
CHECK (
  "volumeM3" = round(
    ("lengthCm" * "widthCm" * "heightCm") / 1000000::numeric,
    6
  )
);

-- Un sector no puede asignarse sin zona.
ALTER TABLE "Package"
ADD CONSTRAINT "Package_sector_requires_zone_check"
CHECK (
  "sectorId" IS NULL OR "zoneId" IS NOT NULL
);

COMMIT;