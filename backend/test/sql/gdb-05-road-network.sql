\set ON_ERROR_STOP on

BEGIN;

INSERT INTO "Tenant" ("id", "name") VALUES
  ('10000000-0000-0000-0000-000000000001', 'GDB05 Tenant A'),
  ('10000000-0000-0000-0000-000000000002', 'GDB05 Tenant B');

INSERT INTO "User" ("id", "tenantId", "email", "passwordHash") VALUES
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'gdb05-a@example.test', 'test'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'gdb05-b@example.test', 'test');

INSERT INTO "GeoDataset" (
  "id", "name", "sourceType", "sourceReference", "sourceDate",
  "checksum", "license", "coverage", "importerVersion", "status", "readyAt"
) VALUES
  (
    '30000000-0000-0000-0000-000000000001', 'GDB05 ready graph', 'SYNTHETIC',
    'gdb05-ready', CURRENT_TIMESTAMP, repeat('a', 64), 'test', 'Barranquilla',
    'gdb05-test', 'READY', CURRENT_TIMESTAMP
  ),
  (
    '30000000-0000-0000-0000-000000000002', 'GDB05 staging graph', 'SYNTHETIC',
    'gdb05-staging', CURRENT_TIMESTAMP, repeat('b', 64), 'test', 'Barranquilla',
    'gdb05-test', 'STAGING', NULL
  ),
  (
    '30000000-0000-0000-0000-000000000003', 'GDB05 OSM graph', 'OSM',
    'osm-fixture', CURRENT_TIMESTAMP, repeat('c', 64), 'ODbL', 'Barranquilla',
    'gdb05-test', 'READY', CURRENT_TIMESTAMP
  );

DO $$
BEGIN
  IF (SELECT "sourceType" FROM "GeoDataset" WHERE "id" = '30000000-0000-0000-0000-000000000001') <> 'SYNTHETIC' THEN
    RAISE EXCEPTION 'synthetic dataset lost its source type';
  END IF;
  IF (SELECT "sourceType" FROM "GeoDataset" WHERE "id" = '30000000-0000-0000-0000-000000000003') <> 'OSM' THEN
    RAISE EXCEPTION 'OSM dataset lost its source type';
  END IF;
  RAISE NOTICE 'PASS: synthetic and OSM datasets remain distinguishable';
END $$;

INSERT INTO "RoadNode" ("id", "datasetId", "osmNodeId", "location") VALUES
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 1001, ST_SetSRID(ST_MakePoint(-74.80, 10.98), 4326)),
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 1002, ST_SetSRID(ST_MakePoint(-74.79, 10.99), 4326)),
  ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', 1003, ST_SetSRID(ST_MakePoint(-74.78, 11.00), 4326)),
  ('40000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000002', 2001, ST_SetSRID(ST_MakePoint(-74.77, 11.01), 4326));

INSERT INTO "RoadEdge" (
  "id", "datasetId", "fromNodeId", "toNodeId", "osmWayId", "profile",
  "distanceM", "durationS", "roadClass", "geometry"
) VALUES
  (
    '50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002',
    5001, 'MOTOR_VEHICLE', 1500, 180, 'residential',
    ST_GeomFromText('LINESTRING(-74.80 10.98,-74.79 10.99)', 4326)
  ),
  (
    '50000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000003',
    5002, 'MOTOR_VEHICLE', 1400, 170, 'residential',
    ST_GeomFromText('LINESTRING(-74.79 10.99,-74.78 11.00)', 4326)
  ),
  (
    '50000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002',
    5003, 'MOTOR_VEHICLE', 1550, 175, 'service',
    ST_GeomFromText('LINESTRING(-74.80 10.98,-74.795 10.985,-74.79 10.99)', 4326)
  );

DO $$
BEGIN
  IF (SELECT count(*) FROM "RoadEdge" WHERE "fromNodeId" = '40000000-0000-0000-0000-000000000001') <> 2 THEN
    RAISE EXCEPTION 'parallel directed edges were not preserved';
  END IF;
  RAISE NOTICE 'PASS: parallel directed edges are preserved';
END $$;

DO $$
BEGIN
  BEGIN
    INSERT INTO "RoadEdge" (
      "datasetId", "fromNodeId", "toNodeId", "profile", "distanceM",
      "durationS", "roadClass", "geometry"
    ) VALUES (
      '30000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000004',
      'MOTOR_VEHICLE', 1, 1, 'test',
      ST_GeomFromText('LINESTRING(-74.80 10.98,-74.77 11.01)', 4326)
    );
    RAISE EXCEPTION 'cross-dataset edge was accepted';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'PASS: cross-dataset edge rejected';
  END;
END $$;

DO $$
BEGIN
  BEGIN
    INSERT INTO "RoadEdge" (
      "datasetId", "fromNodeId", "toNodeId", "profile", "distanceM",
      "durationS", "roadClass", "geometry"
    ) VALUES (
      '30000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000002',
      'MOTOR_VEHICLE', -1, 1, 'test',
      ST_GeomFromText('LINESTRING(-74.80 10.98,-74.79 10.99)', 4326)
    );
    RAISE EXCEPTION 'negative edge cost was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: negative edge cost rejected';
  END;
END $$;

DO $$
BEGIN
  BEGIN
    INSERT INTO "RoadEdge" (
      "datasetId", "fromNodeId", "toNodeId", "profile", "distanceM",
      "durationS", "roadClass", "geometry"
    ) VALUES (
      '30000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000002',
      'MOTOR_VEHICLE', 1, 1, 'test',
      ST_GeomFromText('LINESTRING EMPTY', 4326)
    );
    RAISE EXCEPTION 'empty edge geometry was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: empty edge geometry rejected';
  END;
END $$;

INSERT INTO "RoadTurnRestriction" (
  "id", "datasetId", "incomingEdgeId", "outgoingEdgeId", "viaNodeId",
  "profile", "restrictionType", "sourceRestriction"
) VALUES (
  '60000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000002',
  '40000000-0000-0000-0000-000000000002',
  'MOTOR_VEHICLE', 'NO_TURN', 'no_left_turn'
);

DO $$
BEGIN
  BEGIN
    INSERT INTO "RoadTurnRestriction" (
      "datasetId", "incomingEdgeId", "outgoingEdgeId", "profile",
      "restrictionType", "sourceRestriction"
    ) VALUES (
      '30000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000002',
      'MOTOR_VEHICLE', 'NO_TURN', 'no_left_turn'
    );
    RAISE EXCEPTION 'restriction without via reference was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: restriction requires one via reference';
  END;
END $$;

INSERT INTO "Address" ("id", "tenantId", "originalText", "municipalityCode") VALUES
  ('70000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Tenant A address', '08001'),
  ('70000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Tenant B address', '08001');

INSERT INTO "GeocodingAttempt" (
  "id", "tenantId", "addressId", "datasetId", "normalizedText",
  "components", "algorithmVersion", "status"
) VALUES
  (
    '71000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
    '70000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
    'tenant a address', '{}'::jsonb, 'test', 'MATCHED'
  ),
  (
    '71000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002',
    '70000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001',
    'tenant b address', '{}'::jsonb, 'test', 'MATCHED'
  );

INSERT INTO "GeocodingCandidate" (
  "id", "tenantId", "attemptId", "datasetId", "rank", "score",
  "scoreBreakdown", "source", "precision", "location"
) VALUES
  (
    '72000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
    '71000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
    1, 1, '{}'::jsonb, 'test', 'ENTRANCE', ST_SetSRID(ST_MakePoint(-74.80, 10.98), 4326)
  ),
  (
    '72000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002',
    '71000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001',
    1, 1, '{}'::jsonb, 'test', 'ENTRANCE', ST_SetSRID(ST_MakePoint(-74.79, 10.99), 4326)
  );

INSERT INTO "NetworkAttachment" (
  "id", "tenantId", "datasetId", "geocodingCandidateId", "profile",
  "roadNodeId", "snappedLocation", "accessDistanceM", "status"
) VALUES
  (
    '73000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000001',
    'MOTOR_VEHICLE', '40000000-0000-0000-0000-000000000001',
    ST_SetSRID(ST_MakePoint(-74.80, 10.98), 4326), 0, 'AUTO_ACCEPTED'
  ),
  (
    '73000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000002',
    'MOTOR_VEHICLE', '40000000-0000-0000-0000-000000000002',
    ST_SetSRID(ST_MakePoint(-74.79, 10.99), 4326), 0, 'AUTO_ACCEPTED'
  );

DO $$
BEGIN
  BEGIN
    INSERT INTO "NetworkAttachment" (
      "tenantId", "datasetId", "geocodingCandidateId", "profile",
      "roadNodeId", "roadEdgeId", "snappedLocation", "accessDistanceM", "status"
    ) VALUES (
      '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
      '72000000-0000-0000-0000-000000000001', 'FOOT',
      '40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001',
      ST_SetSRID(ST_MakePoint(-74.80, 10.98), 4326), 0, 'AUTO_ACCEPTED'
    );
    RAISE EXCEPTION 'attachment with two targets was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: attachment requires exactly one target';
  END;
END $$;

INSERT INTO "Vehicle" ("id", "tenantId", "plate", "maxWeightKg", "maxVolumeM3")
VALUES ('80000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'GDB0501', 1000, 20);

INSERT INTO "Courier" ("id", "tenantId", "userId")
VALUES ('81000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001');

INSERT INTO "RoutePlanningRequest" (
  "id", "tenantId", "requestedByUserId", "parameters", "datasetId"
) VALUES (
  '82000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001', '{}'::jsonb,
  '30000000-0000-0000-0000-000000000001'
);

INSERT INTO "Route" (
  "id", "tenantId", "planningRequestId", "vehicleId", "courierId"
) VALUES (
  '83000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
  '82000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001',
  '81000000-0000-0000-0000-000000000001'
);

INSERT INTO "RouteLeg" (
  "id", "tenantId", "routeId", "datasetId", "sequence", "profile",
  "fromNodeId", "toNodeId", "distanceM", "durationS"
) VALUES (
  '84000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
  '83000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
  1, 'MOTOR_VEHICLE', '40000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000003', 2900, 350
);

INSERT INTO "RouteLegEdge" (
  "id", "tenantId", "routeLegId", "datasetId", "roadEdgeId", "sequence"
) VALUES
  (
    '85000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
    '84000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000001', 1
  ),
  (
    '85000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
    '84000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000002', 2
  );

DO $$
BEGIN
  BEGIN
    DELETE FROM "GeoDataset"
    WHERE "id" = '30000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'dataset referenced by a historical route was deleted';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'PASS: referenced graph dataset cannot be deleted';
  END;
END $$;

DO $$
BEGIN
  BEGIN
    INSERT INTO "RouteLegEdge" (
      "tenantId", "routeLegId", "datasetId", "roadEdgeId", "sequence"
    ) VALUES (
      '10000000-0000-0000-0000-000000000001',
      '84000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000001', 0
    );
    RAISE EXCEPTION 'non-positive route-leg edge sequence was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: route-leg edge sequence must be positive';
  END;
END $$;

SET LOCAL ROLE sls_app;
SELECT set_config('app.tenant_id', '10000000-0000-0000-0000-000000000001', true);

DO $$
BEGIN
  IF (SELECT count(*) FROM "NetworkAttachment") <> 1 THEN
    RAISE EXCEPTION 'tenant A can see another tenant attachment';
  END IF;
  IF (SELECT count(*) FROM "RouteLeg") <> 1 THEN
    RAISE EXCEPTION 'tenant A route-leg visibility failed';
  END IF;
  IF (SELECT count(*) FROM "RoadNode") <> 3 THEN
    RAISE EXCEPTION 'shared graph publication policy failed';
  END IF;
  RAISE NOTICE 'PASS: tenant isolation and READY graph publication enforced';
END $$;

RESET ROLE;

ROLLBACK;
