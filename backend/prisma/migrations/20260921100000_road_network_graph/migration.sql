BEGIN;

CREATE TYPE "RoadProfile" AS ENUM (
  'MOTOR_VEHICLE',
  'MOTORCYCLE',
  'BICYCLE',
  'FOOT'
);

CREATE TYPE "RoadTurnRestrictionType" AS ENUM ('NO_TURN', 'ONLY_TURN');

CREATE TYPE "NetworkAttachmentStatus" AS ENUM (
  'AUTO_ACCEPTED',
  'REVIEW_REQUIRED',
  'APPROVED',
  'REJECTED'
);

CREATE TABLE "RoadNode" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "datasetId" UUID NOT NULL,
  "osmNodeId" BIGINT,
  "location" geometry(Point,4326) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RoadNode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RoadEdge" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "datasetId" UUID NOT NULL,
  "fromNodeId" UUID NOT NULL,
  "toNodeId" UUID NOT NULL,
  "osmWayId" BIGINT,
  "profile" "RoadProfile" NOT NULL,
  "distanceM" DECIMAL(12,3) NOT NULL,
  "durationS" DECIMAL(12,3) NOT NULL,
  "roadClass" TEXT NOT NULL,
  "geometry" geometry(LineString,4326) NOT NULL,
  "sourceTags" JSONB,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RoadEdge_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RoadTurnRestriction" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "datasetId" UUID NOT NULL,
  "incomingEdgeId" UUID NOT NULL,
  "outgoingEdgeId" UUID NOT NULL,
  "viaNodeId" UUID,
  "osmRelationId" BIGINT,
  "viaOsmWayId" BIGINT,
  "profile" "RoadProfile" NOT NULL,
  "restrictionType" "RoadTurnRestrictionType" NOT NULL,
  "sourceRestriction" TEXT NOT NULL,
  "sourceTags" JSONB,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RoadTurnRestriction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NetworkAttachment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "datasetId" UUID NOT NULL,
  "geocodingCandidateId" UUID NOT NULL,
  "profile" "RoadProfile" NOT NULL,
  "roadNodeId" UUID,
  "roadEdgeId" UUID,
  "snappedLocation" geometry(Point,4326) NOT NULL,
  "accessDistanceM" DECIMAL(12,3) NOT NULL,
  "status" "NetworkAttachmentStatus" NOT NULL,
  "reviewedByUserId" UUID,
  "reviewReason" TEXT,
  "reviewedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NetworkAttachment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RouteLeg" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "routeId" UUID NOT NULL,
  "datasetId" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "profile" "RoadProfile" NOT NULL,
  "fromNodeId" UUID NOT NULL,
  "toNodeId" UUID NOT NULL,
  "distanceM" DECIMAL(12,3) NOT NULL,
  "durationS" DECIMAL(12,3) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RouteLeg_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RouteLegEdge" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "routeLegId" UUID NOT NULL,
  "datasetId" UUID NOT NULL,
  "roadEdgeId" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RouteLegEdge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RoadNode_datasetId_idx" ON "RoadNode"("datasetId");
CREATE UNIQUE INDEX "RoadNode_datasetId_id_key" ON "RoadNode"("datasetId", "id");
CREATE UNIQUE INDEX "RoadNode_datasetId_osmNodeId_key" ON "RoadNode"("datasetId", "osmNodeId");
CREATE INDEX "RoadNode_location_gist" ON "RoadNode" USING GIST ("location");

CREATE INDEX "RoadEdge_datasetId_profile_fromNodeId_idx" ON "RoadEdge"("datasetId", "profile", "fromNodeId");
CREATE INDEX "RoadEdge_datasetId_profile_toNodeId_idx" ON "RoadEdge"("datasetId", "profile", "toNodeId");
CREATE INDEX "RoadEdge_datasetId_osmWayId_idx" ON "RoadEdge"("datasetId", "osmWayId");
CREATE UNIQUE INDEX "RoadEdge_datasetId_id_key" ON "RoadEdge"("datasetId", "id");
CREATE INDEX "RoadEdge_geometry_gist" ON "RoadEdge" USING GIST ("geometry");

CREATE INDEX "RoadTurnRestriction_datasetId_profile_incomingEdgeId_idx" ON "RoadTurnRestriction"("datasetId", "profile", "incomingEdgeId");
CREATE INDEX "RoadTurnRestriction_datasetId_profile_outgoingEdgeId_idx" ON "RoadTurnRestriction"("datasetId", "profile", "outgoingEdgeId");
CREATE INDEX "RoadTurnRestriction_datasetId_osmRelationId_idx" ON "RoadTurnRestriction"("datasetId", "osmRelationId");
CREATE UNIQUE INDEX "RoadTurnRestriction_datasetId_id_key" ON "RoadTurnRestriction"("datasetId", "id");

CREATE INDEX "NetworkAttachment_datasetId_profile_roadNodeId_idx" ON "NetworkAttachment"("datasetId", "profile", "roadNodeId");
CREATE INDEX "NetworkAttachment_datasetId_profile_roadEdgeId_idx" ON "NetworkAttachment"("datasetId", "profile", "roadEdgeId");
CREATE INDEX "NetworkAttachment_tenantId_status_idx" ON "NetworkAttachment"("tenantId", "status");
CREATE UNIQUE INDEX "NetworkAttachment_tenantId_id_key" ON "NetworkAttachment"("tenantId", "id");
CREATE UNIQUE INDEX "NetworkAttachment_tenantId_geocodingCandidateId_datasetId_p_key"
  ON "NetworkAttachment"("tenantId", "geocodingCandidateId", "datasetId", "profile");
CREATE INDEX "NetworkAttachment_snappedLocation_gist"
  ON "NetworkAttachment" USING GIST ("snappedLocation");

CREATE INDEX "RouteLeg_datasetId_profile_idx" ON "RouteLeg"("datasetId", "profile");
CREATE UNIQUE INDEX "RouteLeg_tenantId_id_key" ON "RouteLeg"("tenantId", "id");
CREATE UNIQUE INDEX "RouteLeg_tenantId_id_datasetId_key" ON "RouteLeg"("tenantId", "id", "datasetId");
CREATE UNIQUE INDEX "RouteLeg_tenantId_routeId_sequence_key" ON "RouteLeg"("tenantId", "routeId", "sequence");

CREATE INDEX "RouteLegEdge_datasetId_roadEdgeId_idx" ON "RouteLegEdge"("datasetId", "roadEdgeId");
CREATE UNIQUE INDEX "RouteLegEdge_tenantId_id_key" ON "RouteLegEdge"("tenantId", "id");
CREATE UNIQUE INDEX "RouteLegEdge_tenantId_routeLegId_sequence_key" ON "RouteLegEdge"("tenantId", "routeLegId", "sequence");

CREATE UNIQUE INDEX "GeocodingCandidate_tenantId_id_datasetId_key"
  ON "GeocodingCandidate"("tenantId", "id", "datasetId");

ALTER TABLE "RoadNode"
  ADD CONSTRAINT "RoadNode_datasetId_fkey"
  FOREIGN KEY ("datasetId") REFERENCES "GeoDataset"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "RoadEdge"
  ADD CONSTRAINT "RoadEdge_datasetId_fkey"
  FOREIGN KEY ("datasetId") REFERENCES "GeoDataset"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "RoadEdge_datasetId_fromNodeId_fkey"
  FOREIGN KEY ("datasetId", "fromNodeId") REFERENCES "RoadNode"("datasetId", "id")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "RoadEdge_datasetId_toNodeId_fkey"
  FOREIGN KEY ("datasetId", "toNodeId") REFERENCES "RoadNode"("datasetId", "id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "RoadTurnRestriction"
  ADD CONSTRAINT "RoadTurnRestriction_datasetId_fkey"
  FOREIGN KEY ("datasetId") REFERENCES "GeoDataset"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "RoadTurnRestriction_datasetId_incomingEdgeId_fkey"
  FOREIGN KEY ("datasetId", "incomingEdgeId") REFERENCES "RoadEdge"("datasetId", "id")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "RoadTurnRestriction_datasetId_outgoingEdgeId_fkey"
  FOREIGN KEY ("datasetId", "outgoingEdgeId") REFERENCES "RoadEdge"("datasetId", "id")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "RoadTurnRestriction_datasetId_viaNodeId_fkey"
  FOREIGN KEY ("datasetId", "viaNodeId") REFERENCES "RoadNode"("datasetId", "id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "NetworkAttachment"
  ADD CONSTRAINT "NetworkAttachment_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "NetworkAttachment_datasetId_fkey"
  FOREIGN KEY ("datasetId") REFERENCES "GeoDataset"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "NetworkAttachment_tenantId_geocodingCandidateId_datasetId_fkey"
  FOREIGN KEY ("tenantId", "geocodingCandidateId", "datasetId")
  REFERENCES "GeocodingCandidate"("tenantId", "id", "datasetId")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "NetworkAttachment_datasetId_roadNodeId_fkey"
  FOREIGN KEY ("datasetId", "roadNodeId") REFERENCES "RoadNode"("datasetId", "id")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "NetworkAttachment_datasetId_roadEdgeId_fkey"
  FOREIGN KEY ("datasetId", "roadEdgeId") REFERENCES "RoadEdge"("datasetId", "id")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "NetworkAttachment_tenantId_reviewedByUserId_fkey"
  FOREIGN KEY ("tenantId", "reviewedByUserId") REFERENCES "User"("tenantId", "id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "RouteLeg"
  ADD CONSTRAINT "RouteLeg_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "RouteLeg_tenantId_routeId_fkey"
  FOREIGN KEY ("tenantId", "routeId") REFERENCES "Route"("tenantId", "id")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "RouteLeg_datasetId_fkey"
  FOREIGN KEY ("datasetId") REFERENCES "GeoDataset"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "RouteLeg_datasetId_fromNodeId_fkey"
  FOREIGN KEY ("datasetId", "fromNodeId") REFERENCES "RoadNode"("datasetId", "id")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "RouteLeg_datasetId_toNodeId_fkey"
  FOREIGN KEY ("datasetId", "toNodeId") REFERENCES "RoadNode"("datasetId", "id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "RouteLegEdge"
  ADD CONSTRAINT "RouteLegEdge_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "RouteLegEdge_tenantId_routeLegId_datasetId_fkey"
  FOREIGN KEY ("tenantId", "routeLegId", "datasetId")
  REFERENCES "RouteLeg"("tenantId", "id", "datasetId")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "RouteLegEdge_datasetId_roadEdgeId_fkey"
  FOREIGN KEY ("datasetId", "roadEdgeId") REFERENCES "RoadEdge"("datasetId", "id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "RoadNode"
  ADD CONSTRAINT "RoadNode_location_check" CHECK (
    NOT ST_IsEmpty("location")
    AND ST_IsValid("location")
    AND ST_X("location") BETWEEN -180 AND 180
    AND ST_Y("location") BETWEEN -90 AND 90
  );

ALTER TABLE "RoadEdge"
  ADD CONSTRAINT "RoadEdge_metrics_check" CHECK (
    "distanceM" >= 0 AND "distanceM" < 'Infinity'::numeric
    AND "durationS" >= 0 AND "durationS" < 'Infinity'::numeric
  ),
  ADD CONSTRAINT "RoadEdge_roadClass_check"
    CHECK (length(btrim("roadClass")) > 0),
  ADD CONSTRAINT "RoadEdge_geometry_check" CHECK (
    NOT ST_IsEmpty("geometry")
    AND ST_IsValid("geometry")
    AND ST_NPoints("geometry") >= 2
    AND ST_XMin(Box3D("geometry")) BETWEEN -180 AND 180
    AND ST_XMax(Box3D("geometry")) BETWEEN -180 AND 180
    AND ST_YMin(Box3D("geometry")) BETWEEN -90 AND 90
    AND ST_YMax(Box3D("geometry")) BETWEEN -90 AND 90
  );

ALTER TABLE "RoadTurnRestriction"
  ADD CONSTRAINT "RoadTurnRestriction_edges_check"
    CHECK ("incomingEdgeId" <> "outgoingEdgeId"),
  ADD CONSTRAINT "RoadTurnRestriction_via_check"
    CHECK (num_nonnulls("viaNodeId", "viaOsmWayId") = 1),
  ADD CONSTRAINT "RoadTurnRestriction_source_check"
    CHECK (length(btrim("sourceRestriction")) > 0);

ALTER TABLE "NetworkAttachment"
  ADD CONSTRAINT "NetworkAttachment_target_check"
    CHECK (num_nonnulls("roadNodeId", "roadEdgeId") = 1),
  ADD CONSTRAINT "NetworkAttachment_distance_check" CHECK (
    "accessDistanceM" >= 0 AND "accessDistanceM" < 'Infinity'::numeric
  ),
  ADD CONSTRAINT "NetworkAttachment_location_check" CHECK (
    NOT ST_IsEmpty("snappedLocation")
    AND ST_IsValid("snappedLocation")
    AND ST_X("snappedLocation") BETWEEN -180 AND 180
    AND ST_Y("snappedLocation") BETWEEN -90 AND 90
  ),
  ADD CONSTRAINT "NetworkAttachment_review_check" CHECK (
    (
      "status" IN ('AUTO_ACCEPTED', 'REVIEW_REQUIRED')
      AND "reviewedByUserId" IS NULL
      AND "reviewedAt" IS NULL
      AND "reviewReason" IS NULL
    )
    OR (
      "status" = 'APPROVED'
      AND "reviewedByUserId" IS NOT NULL
      AND "reviewedAt" IS NOT NULL
    )
    OR (
      "status" = 'REJECTED'
      AND "reviewedByUserId" IS NOT NULL
      AND "reviewedAt" IS NOT NULL
      AND length(btrim("reviewReason")) > 0
    )
  );

ALTER TABLE "RouteLeg"
  ADD CONSTRAINT "RouteLeg_sequence_check" CHECK ("sequence" > 0),
  ADD CONSTRAINT "RouteLeg_metrics_check" CHECK (
    "distanceM" >= 0 AND "distanceM" < 'Infinity'::numeric
    AND "durationS" >= 0 AND "durationS" < 'Infinity'::numeric
  );

ALTER TABLE "RouteLegEdge"
  ADD CONSTRAINT "RouteLegEdge_sequence_check" CHECK ("sequence" > 0);

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'NetworkAttachment',
    'RouteLeg',
    'RouteLegEdge'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
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
  "NetworkAttachment",
  "RouteLeg",
  "RouteLegEdge"
TO sls_app;

GRANT UPDATE ("status", "reviewedByUserId", "reviewReason", "reviewedAt")
ON "NetworkAttachment" TO sls_app;

ALTER TABLE "RoadNode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RoadNode" FORCE ROW LEVEL SECURITY;
CREATE POLICY published_road_node_read ON "RoadNode"
FOR SELECT TO sls_app
USING (
  EXISTS (
    SELECT 1 FROM "GeoDataset" AS dataset
    WHERE dataset."id" = "RoadNode"."datasetId"
      AND dataset."status" = 'READY'
  )
);

ALTER TABLE "RoadEdge" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RoadEdge" FORCE ROW LEVEL SECURITY;
CREATE POLICY published_road_edge_read ON "RoadEdge"
FOR SELECT TO sls_app
USING (
  EXISTS (
    SELECT 1 FROM "GeoDataset" AS dataset
    WHERE dataset."id" = "RoadEdge"."datasetId"
      AND dataset."status" = 'READY'
  )
);

ALTER TABLE "RoadTurnRestriction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RoadTurnRestriction" FORCE ROW LEVEL SECURITY;
CREATE POLICY published_turn_restriction_read ON "RoadTurnRestriction"
FOR SELECT TO sls_app
USING (
  EXISTS (
    SELECT 1 FROM "GeoDataset" AS dataset
    WHERE dataset."id" = "RoadTurnRestriction"."datasetId"
      AND dataset."status" = 'READY'
  )
);

GRANT SELECT ON "RoadNode", "RoadEdge", "RoadTurnRestriction" TO sls_app;

COMMIT;
