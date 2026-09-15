BEGIN;

-- CreateEnum
CREATE TYPE "GeoDatasetSource" AS ENUM ('SYNTHETIC', 'OSM', 'LOCAL_VERIFIED');

-- CreateEnum
CREATE TYPE "GeoDatasetStatus" AS ENUM ('STAGING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "AddressPrecision" AS ENUM ('ENTRANCE', 'BUILDING', 'INTERPOLATED', 'STREET');

-- CreateEnum
CREATE TYPE "GeocodingStatus" AS ENUM ('MATCHED', 'REVIEW_REQUIRED', 'NOT_FOUND');

-- CreateEnum
CREATE TYPE "GeocodingReviewDecision" AS ENUM ('APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "GeoDataset" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "sourceType" "GeoDatasetSource" NOT NULL,
    "sourceReference" TEXT NOT NULL,
    "sourceDate" TIMESTAMPTZ(3) NOT NULL,
    "checksum" VARCHAR(64) NOT NULL,
    "license" TEXT NOT NULL,
    "coverage" TEXT NOT NULL,
    "importerVersion" TEXT NOT NULL,
    "status" "GeoDatasetStatus" NOT NULL DEFAULT 'STAGING',
    "failureReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readyAt" TIMESTAMPTZ(3),

    CONSTRAINT "GeoDataset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AddressReference" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "datasetId" UUID NOT NULL,
    "sourceRecordId" TEXT NOT NULL,
    "municipalityCode" TEXT NOT NULL,
    "streetType" TEXT NOT NULL,
    "streetIdentifier" TEXT NOT NULL,
    "generatingRoad" TEXT,
    "plateNumber" TEXT,
    "neighborhood" TEXT,
    "sourceAddress" TEXT,
    "sourceTags" JSONB,
    "normalizedAddress" TEXT NOT NULL,
    "searchKey" TEXT NOT NULL,
    "location" geometry(Point,4326) NOT NULL,
    "precision" "AddressPrecision" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AddressReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Address" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "originalText" TEXT NOT NULL,
    "municipalityCode" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeocodingAttempt" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "addressId" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "selectedCandidateId" UUID,
    "normalizedText" TEXT NOT NULL,
    "components" JSONB NOT NULL,
    "algorithmVersion" TEXT NOT NULL,
    "status" "GeocodingStatus" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeocodingAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeocodingCandidate" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "attemptId" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "addressReferenceId" UUID,
    "rank" INTEGER NOT NULL,
    "score" DECIMAL(5,4) NOT NULL,
    "scoreBreakdown" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "precision" "AddressPrecision" NOT NULL,
    "location" geometry(Point,4326) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeocodingCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeocodingReview" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "attemptId" UUID NOT NULL,
    "candidateId" UUID NOT NULL,
    "reviewerId" UUID NOT NULL,
    "decision" "GeocodingReviewDecision" NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeocodingReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GeoDataset_sourceType_status_idx" ON "GeoDataset"("sourceType", "status");

-- CreateIndex
CREATE INDEX "GeoDataset_checksum_idx" ON "GeoDataset"("checksum");

-- CreateIndex
CREATE INDEX "AddressReference_datasetId_municipalityCode_searchKey_idx" ON "AddressReference"("datasetId", "municipalityCode", "searchKey");

-- CreateIndex
CREATE UNIQUE INDEX "AddressReference_datasetId_id_key" ON "AddressReference"("datasetId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AddressReference_datasetId_sourceRecordId_key" ON "AddressReference"("datasetId", "sourceRecordId");

-- CreateIndex
CREATE INDEX "Address_tenantId_municipalityCode_idx" ON "Address"("tenantId", "municipalityCode");

-- CreateIndex
CREATE UNIQUE INDEX "Address_tenantId_id_key" ON "Address"("tenantId", "id");

-- CreateIndex
CREATE INDEX "GeocodingAttempt_tenantId_addressId_createdAt_idx" ON "GeocodingAttempt"("tenantId", "addressId", "createdAt");

-- CreateIndex
CREATE INDEX "GeocodingAttempt_datasetId_idx" ON "GeocodingAttempt"("datasetId");

-- CreateIndex
CREATE UNIQUE INDEX "GeocodingAttempt_tenantId_id_key" ON "GeocodingAttempt"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "GeocodingAttempt_tenantId_id_datasetId_key" ON "GeocodingAttempt"("tenantId", "id", "datasetId");

-- CreateIndex
CREATE INDEX "GeocodingCandidate_addressReferenceId_idx" ON "GeocodingCandidate"("addressReferenceId");

-- CreateIndex
CREATE UNIQUE INDEX "GeocodingCandidate_tenantId_id_key" ON "GeocodingCandidate"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "GeocodingCandidate_tenantId_id_attemptId_key" ON "GeocodingCandidate"("tenantId", "id", "attemptId");

-- CreateIndex
CREATE UNIQUE INDEX "GeocodingCandidate_tenantId_attemptId_rank_key" ON "GeocodingCandidate"("tenantId", "attemptId", "rank");

-- CreateIndex
CREATE INDEX "GeocodingReview_tenantId_attemptId_createdAt_idx" ON "GeocodingReview"("tenantId", "attemptId", "createdAt");

-- CreateIndex
CREATE INDEX "GeocodingReview_tenantId_candidateId_attemptId_idx" ON "GeocodingReview"("tenantId", "candidateId", "attemptId");

-- CreateIndex
CREATE INDEX "GeocodingReview_tenantId_reviewerId_idx" ON "GeocodingReview"("tenantId", "reviewerId");

-- AddForeignKey
ALTER TABLE "AddressReference" ADD CONSTRAINT "AddressReference_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "GeoDataset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeocodingAttempt" ADD CONSTRAINT "GeocodingAttempt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeocodingAttempt" ADD CONSTRAINT "GeocodingAttempt_tenantId_addressId_fkey" FOREIGN KEY ("tenantId", "addressId") REFERENCES "Address"("tenantId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "GeocodingAttempt" ADD CONSTRAINT "GeocodingAttempt_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "GeoDataset"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "GeocodingAttempt" ADD CONSTRAINT "GeocodingAttempt_tenantId_selectedCandidateId_id_fkey" FOREIGN KEY ("tenantId", "selectedCandidateId", "id") REFERENCES "GeocodingCandidate"("tenantId", "id", "attemptId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "GeocodingCandidate" ADD CONSTRAINT "GeocodingCandidate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeocodingCandidate" ADD CONSTRAINT "GeocodingCandidate_tenantId_attemptId_datasetId_fkey" FOREIGN KEY ("tenantId", "attemptId", "datasetId") REFERENCES "GeocodingAttempt"("tenantId", "id", "datasetId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "GeocodingCandidate" ADD CONSTRAINT "GeocodingCandidate_datasetId_addressReferenceId_fkey" FOREIGN KEY ("datasetId", "addressReferenceId") REFERENCES "AddressReference"("datasetId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "GeocodingReview" ADD CONSTRAINT "GeocodingReview_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeocodingReview" ADD CONSTRAINT "GeocodingReview_tenantId_attemptId_fkey" FOREIGN KEY ("tenantId", "attemptId") REFERENCES "GeocodingAttempt"("tenantId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "GeocodingReview" ADD CONSTRAINT "GeocodingReview_tenantId_candidateId_attemptId_fkey" FOREIGN KEY ("tenantId", "candidateId", "attemptId") REFERENCES "GeocodingCandidate"("tenantId", "id", "attemptId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "GeocodingReview" ADD CONSTRAINT "GeocodingReview_tenantId_reviewerId_fkey" FOREIGN KEY ("tenantId", "reviewerId") REFERENCES "User"("tenantId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Puntuación y posición del candidato.
ALTER TABLE "GeocodingCandidate"
ADD CONSTRAINT "GeocodingCandidate_score_check"
CHECK ("score" BETWEEN 0 AND 1),
ADD CONSTRAINT "GeocodingCandidate_rank_check"
CHECK ("rank" > 0);

-- Referencias con ubicaciones válidas.
ALTER TABLE "AddressReference"
ADD CONSTRAINT "AddressReference_location_check"
CHECK (
  NOT ST_IsEmpty("location")
  AND ST_IsValid("location")
  AND ST_X("location") BETWEEN -180 AND 180
  AND ST_Y("location") BETWEEN -90 AND 90
);

-- Candidatos con ubicaciones válidas.
ALTER TABLE "GeocodingCandidate"
ADD CONSTRAINT "GeocodingCandidate_location_check"
CHECK (
  NOT ST_IsEmpty("location")
  AND ST_IsValid("location")
  AND ST_X("location") BETWEEN -180 AND 180
  AND ST_Y("location") BETWEEN -90 AND 90
);

-- Índices para búsquedas espaciales.
CREATE INDEX "AddressReference_location_gist"
ON "AddressReference" USING GIST ("location");

CREATE INDEX "GeocodingCandidate_location_gist"
ON "GeocodingCandidate" USING GIST ("location");

-- SHA-256 expresado como 64 caracteres hexadecimales.
ALTER TABLE "GeoDataset"
ADD CONSTRAINT "GeoDataset_checksum_check"
CHECK ("checksum" ~ '^[0-9A-Fa-f]{64}$');

-- Evitar direcciones y motivos vacíos.
ALTER TABLE "Address"
ADD CONSTRAINT "Address_originalText_check"
CHECK (length(btrim("originalText")) > 0);

ALTER TABLE "GeocodingReview"
ADD CONSTRAINT "GeocodingReview_reason_check"
CHECK (length(btrim("reason")) > 0);

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'Address',
    'GeocodingAttempt',
    'GeocodingCandidate',
    'GeocodingReview'
  ]
  LOOP
    EXECUTE format(
      'ALTER TABLE %I ENABLE ROW LEVEL SECURITY',
      table_name
    );

    EXECUTE format(
      'ALTER TABLE %I FORCE ROW LEVEL SECURITY',
      table_name
    );

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

GRANT SELECT, INSERT ON
  "Address",
  "GeocodingAttempt",
  "GeocodingCandidate",
  "GeocodingReview"
TO sls_app;

-- Permite resolver un intento sin modificar su dirección,
-- dataset, versión del algoritmo ni evidencia original.
GRANT UPDATE ("selectedCandidateId", "status")
ON "GeocodingAttempt"
TO sls_app;

ALTER TABLE "GeoDataset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GeoDataset" FORCE ROW LEVEL SECURITY;

CREATE POLICY published_dataset_read
ON "GeoDataset"
FOR SELECT TO sls_app
USING ("status" = 'READY');

ALTER TABLE "AddressReference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AddressReference" FORCE ROW LEVEL SECURITY;

CREATE POLICY published_reference_read
ON "AddressReference"
FOR SELECT TO sls_app
USING (
  EXISTS (
    SELECT 1
    FROM "GeoDataset" AS dataset
    WHERE dataset."id" = "AddressReference"."datasetId"
      AND dataset."status" = 'READY'
  )
);

GRANT SELECT ON "GeoDataset", "AddressReference" TO sls_app;

COMMIT;