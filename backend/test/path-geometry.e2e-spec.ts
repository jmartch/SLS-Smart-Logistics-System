import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaService } from '../src/database/prisma.service';
import { PrismaRoadPathGeometryRepository } from '../src/modules/route-planning/infrastructure/path-geometry-repository';

describe('Road path geometry con PostGIS', () => {
  const admin = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const app = new PrismaService();
  let fixturesCommitted = false;

  const datasetId = randomUUID();
  const nodeA = randomUUID();
  const nodeB = randomUUID();
  const nodeC = randomUUID();
  const edgeAB = randomUUID();
  const edgeBC = randomUUID();

  beforeAll(async () => {
    for (const variable of ['DATABASE_URL', 'RUNTIME_DATABASE_URL'] as const) {
      const connectionString = process.env[variable];

      if (!connectionString) {
        throw new Error(`${variable} is required`);
      }

      const databasePath = new URL(connectionString).pathname;

      if (!/^\/sls_gdb05_[0-9a-f]{32}$/.test(databasePath)) {
        throw new Error(
          `${variable} must point to a disposable database created by gdb-05.cjs`,
        );
      }
    }

    await admin.$connect();
    await app.$connect();

    await admin.$transaction(async (transaction) => {
      await transaction.geoDataset.create({
        data: {
          id: datasetId,
          name: 'GDB-05 path geometry integration test',
          sourceType: 'SYNTHETIC',
          sourceReference: `path-geometry-${datasetId}`,
          sourceDate: new Date(),
          checksum: 'a'.repeat(64),
          license: 'test',
          coverage: 'synthetic',
          importerVersion: 'gdb-05-test',
          status: 'READY',
          readyAt: new Date(),
        },
      });

      await transaction.$executeRaw`
                INSERT INTO "RoadNode" ("id", "datasetId", "location") VALUES
                    (${nodeA}::uuid, ${datasetId}::uuid,
                     ST_SetSRID(ST_MakePoint(${-74.8}, ${10.98}), 4326)),
                    (${nodeB}::uuid, ${datasetId}::uuid,
                     ST_SetSRID(ST_MakePoint(${-74.79}, ${10.99}), 4326)),
                    (${nodeC}::uuid, ${datasetId}::uuid,
                     ST_SetSRID(ST_MakePoint(${-74.78}, ${11}), 4326))
            `;

      await transaction.$executeRaw`
                INSERT INTO "RoadEdge" (
                    "id", "datasetId", "fromNodeId", "toNodeId", "profile",
                    "distanceM", "durationS", "roadClass", "geometry"
                ) VALUES (
                    ${edgeAB}::uuid, ${datasetId}::uuid, ${nodeA}::uuid, ${nodeB}::uuid,
                    'MOTOR_VEHICLE', 1500, 180, 'residential',
                    ST_GeomFromText('LINESTRING(-74.80 10.98,-74.79 10.99)', 4326)
                ), (
                    ${edgeBC}::uuid, ${datasetId}::uuid, ${nodeB}::uuid, ${nodeC}::uuid,
                    'MOTOR_VEHICLE', 1400, 170, 'residential',
                    ST_GeomFromText('LINESTRING(-74.78 11.00,-74.79 10.99)', 4326)
                )
            `;
    });
    fixturesCommitted = true;
  });

  afterAll(async () => {
    try {
      if (fixturesCommitted) {
        await admin.roadEdge.deleteMany({ where: { datasetId } });
        await admin.roadNode.deleteMany({ where: { datasetId } });
        await admin.geoDataset.deleteMany({ where: { id: datasetId } });
      }
    } finally {
      await app.$disconnect();
      await admin.$disconnect();
    }
  });

  it('ordena las aristas e invierte una geometría contraria', async () => {
    const repository = new PrismaRoadPathGeometryRepository(app);

    const result = await repository.loadOrderedGeometries(datasetId, [
      edgeAB,
      edgeBC,
    ]);

    expect(result).toEqual([
      {
        edgeId: edgeAB,
        coordinates: [
          [-74.8, 10.98],
          [-74.79, 10.99],
        ],
      },
      {
        edgeId: edgeBC,
        coordinates: [
          [-74.79, 10.99],
          [-74.78, 11],
        ],
      },
    ]);
  });
});
