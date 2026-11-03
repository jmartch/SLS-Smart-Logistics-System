import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import {
  buildOsmDemoRows,
  verifyOsmDemoRows,
  stableOsmId,
  type OsmDemoExtract,
} from './osm-demo-extract';

export async function importOsmDemo(): Promise<string> {
  const sourceFile = resolve('prisma/data/barranquilla-demo.osm.json.gz');
  const content = gunzipSync(readFileSync(sourceFile)).toString('utf8');
  const extract = JSON.parse(content) as OsmDemoExtract;
  const checksum = createHash('sha256').update(content).digest('hex');
  const datasetId = stableOsmId(`sls-osm-demo-v1/${checksum}`);
  const rows = buildOsmDemoRows(extract, datasetId);
  const verified = verifyOsmDemoRows(rows, datasetId);
  if (
    rows.nodes.length < 3 ||
    rows.edges.length < 3 ||
    rows.references.length < 3
  ) {
    throw new Error(
      'OSM demo requires a road graph and at least three supported address points',
    );
  }
  if (!process.env.DATABASE_URL)
    throw new Error('DATABASE_URL is required for administrative import');
  const admin = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  try {
    await admin.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${checksum}, 0))`;
        const existing = await tx.geoDataset.findUnique({
          where: { id: datasetId },
        });
        if (existing?.status === 'READY') return;
        if (existing)
          throw new Error(
            'Existing incomplete import requires explicit review',
          );
        await tx.geoDataset.create({
          data: {
            id: datasetId,
            name: 'Barranquilla · El Prado–Alto Prado · OSM demo',
            sourceType: 'OSM',
            sourceReference: extract.sourceUrl,
            sourceDate: new Date(extract.fetchedAt),
            checksum,
            license: 'ODbL-1.0 © OpenStreetMap contributors',
            coverage: `Extracto de demo; bbox ${extract.bounds.join(',')}; sin restricciones de giro ni tráfico`,
            importerVersion: 'sls-osm-demo-v1',
            status: 'STAGING',
          },
        });
        await tx.$executeRaw`
        INSERT INTO "RoadNode" (id, "datasetId", "osmNodeId", location)
        SELECT id::uuid, ${datasetId}::uuid, "osmNodeId", ST_SetSRID(ST_MakePoint(lon, lat),4326)
        FROM jsonb_to_recordset(${JSON.stringify(rows.nodes)}::jsonb)
        AS n(id text, "osmNodeId" bigint, lat float8, lon float8)
      `;
        await tx.$executeRaw`
        INSERT INTO "RoadEdge" (id,"datasetId","fromNodeId","toNodeId","osmWayId",profile,"distanceM","durationS","roadClass",geometry,"sourceTags")
        SELECT id::uuid,${datasetId}::uuid,"fromNodeId"::uuid,"toNodeId"::uuid,"osmWayId",'MOTOR_VEHICLE',
          "distanceM","durationS","roadClass",ST_SetSRID(ST_GeomFromGeoJSON(jsonb_build_object('type','LineString','coordinates',points)::text),4326),tags
        FROM jsonb_to_recordset(${JSON.stringify(rows.edges)}::jsonb)
        AS e(id text,"fromNodeId" text,"toNodeId" text,"osmWayId" bigint,"distanceM" numeric,"durationS" numeric,"roadClass" text,points jsonb,tags jsonb)
      `;
        await tx.$executeRaw`
        INSERT INTO "AddressReference" (id,"datasetId","sourceRecordId","municipalityCode","streetType","streetIdentifier","generatingRoad","plateNumber","sourceAddress","sourceTags","normalizedAddress","searchKey",location,precision)
        SELECT id::uuid,${datasetId}::uuid,"sourceRecordId",'08001',"streetType","streetIdentifier","generatingRoad","plateNumber",tags->>'addr:street'||' # '||(tags->>'addr:housenumber'),tags,"normalizedAddress","searchKey",ST_SetSRID(ST_MakePoint(lon,lat),4326),'BUILDING'
        FROM jsonb_to_recordset(${JSON.stringify(rows.references)}::jsonb)
        AS a(id text,"sourceRecordId" text,"streetType" text,"streetIdentifier" text,"generatingRoad" text,"plateNumber" text,"normalizedAddress" text,"searchKey" text,lat float8,lon float8,tags jsonb)
      `;
        await tx.geoDataset.update({
          where: { id: datasetId },
          data: { status: 'READY', readyAt: new Date() },
        });
      },
      { timeout: 60000 },
    );
    process.stdout.write(
      `${JSON.stringify({ datasetId, checksum, nodes: rows.nodes.length, edges: rows.edges.length, addresses: rows.references.length, skippedWays: rows.skippedWays, skippedAddresses: rows.skippedAddresses, examples: verified.examples.map((e) => e.address) }, null, 2)}\n`,
    );
    return datasetId;
  } finally {
    await admin.$disconnect();
  }
}

if (require.main === module) {
  importOsmDemo().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
