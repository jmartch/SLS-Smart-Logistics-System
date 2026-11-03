import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { PrismaService } from '../src/database/prisma.service';
import { runWithTenant } from '../src/database/run-with-tenant';
import { RegisterPackageService } from '../src/modules/packages/application/register-package.service';
import { PrismaPackageRegistrationAdapter } from '../src/modules/packages/infrastructure/prisma-package-registration.adapter';
import { CryptoPublicTrackingTokenGenerator } from '../src/modules/packages/infrastructure/crypto-public-tracking-token.generator';
import { GeocodeAddressService } from '../src/modules/geocoding/application/geocode-address.service';
import { PrismaGeocodingAddress } from '../src/modules/geocoding/infrastructure/prisma-geocoding-address';
import { PrismaGeocodingCatalog } from '../src/modules/geocoding/infrastructure/prisma-geocoding-catalog';
import { PrismaGeocodingAttempt } from '../src/modules/geocoding/infrastructure/prisma-geocoding-attempt';
import { importOsmDemo } from './import-osm-demo';
import {
  buildOsmDemoRows,
  verifyOsmDemoRows,
  stableOsmId,
  type OsmDemoExtract,
} from './osm-demo-extract';
import { DEMO_IDS } from './demo-config';

export interface OsmDemoPreparation {
  readonly datasetId: string;
  readonly depotId: string;
  readonly packages: readonly {
    packageId: string;
    trackingCode: string;
    address: string;
    state: string;
  }[];
}

export async function prepareOsmDemo(
  options: { quiet?: boolean } = {},
): Promise<OsmDemoPreparation> {
  const datasetId = await importOsmDemo();
  const extract = JSON.parse(
    gunzipSync(
      readFileSync('prisma/data/barranquilla-demo.osm.json.gz'),
    ).toString('utf8'),
  ) as OsmDemoExtract;
  const { depot, examples } = verifyOsmDemoRows(
    buildOsmDemoRows(extract, datasetId),
    datasetId,
  );
  const db = new PrismaService();
  const context = {
    tenantId: DEMO_IDS.tenantId,
    actorUserId: DEMO_IDS.adminUserId,
    correlationId: randomUUID(),
  };
  const depotId = stableOsmId(`${datasetId}/demo-depot`);
  const register = new RegisterPackageService(
    new PrismaPackageRegistrationAdapter(db),
    new CryptoPublicTrackingTokenGenerator(),
  );
  const geocode = new GeocodeAddressService(
    new PrismaGeocodingAddress(db),
    new PrismaGeocodingCatalog(db),
    new PrismaGeocodingAttempt(db),
  );
  try {
    await runWithTenant(db, context.tenantId, async (tx) => {
      const actor = await tx.user.findFirst({
        where: {
          tenantId: context.tenantId,
          id: context.actorUserId,
          status: 'ACTIVE',
        },
      });
      if (!actor)
        throw new Error(
          'Active demo tenant and administrator are required; no tenant data was reset',
        );
      await tx.$executeRaw`
        INSERT INTO "Depot" (id,"tenantId",name,location,"timeZone","openingHours")
        VALUES (${depotId}::uuid,${context.tenantId}::uuid,'Depósito OSM demo · El Prado',ST_SetSRID(ST_MakePoint(${depot.lon},${depot.lat}),4326),'America/Bogota','{}'::jsonb)
        ON CONFLICT (id) DO NOTHING
      `;
    });
    const packages: Array<{
      packageId: string;
      trackingCode: string;
      address: string;
      state: string;
    }> = [];
    for (const [index, example] of examples.entries()) {
      const trackingCode = `OSM-DEMO-${datasetId.slice(0, 8).toUpperCase()}-${index + 1}`;
      let pkg = await runWithTenant(db, context.tenantId, (tx) =>
        tx.package.findFirst({
          where: { tenantId: context.tenantId, trackingCode },
        }),
      );
      if (!pkg) {
        const result = await register.execute(context, {
          trackingCode,
          address: { text: example.address, municipalityCode: '08001' },
          shipmentTypeId: DEMO_IDS.shipmentTypeId,
          weightKg: '1',
          lengthCm: '20',
          widthCm: '20',
          heightCm: '20',
          priority: 'NORMAL',
        });
        if (!result.ok)
          throw new Error(`Demo registration failed: ${result.code}`);
        pkg = await runWithTenant(db, context.tenantId, (tx) =>
          tx.package.findFirstOrThrow({
            where: { tenantId: context.tenantId, id: result.package.id },
          }),
        );
      }
      // Preserve packages that have already entered an operational route.
      if (
        !pkg.geocodingAttemptId &&
        ['REGISTERED', 'CLASSIFIED', 'PENDING_ASSIGNMENT'].includes(pkg.state)
      ) {
        const result = await geocode.execute({
          tenantId: context.tenantId,
          addressId: pkg.addressId,
          datasetId,
        });
        if (result.kind !== 'COMPLETED' || result.decision.status !== 'MATCHED')
          throw new Error('Demo address did not geocode automatically');
        const packageId = pkg.id;
        await runWithTenant(db, context.tenantId, async (tx) => {
          const attempt = await tx.geocodingAttempt.findFirstOrThrow({
            where: { tenantId: context.tenantId, id: result.attemptId },
          });
          if (!attempt.selectedCandidateId)
            throw new Error('Missing selected OSM candidate');
          await tx.$executeRaw`
            INSERT INTO "NetworkAttachment" ("tenantId","datasetId","geocodingCandidateId",profile,"roadNodeId","snappedLocation","accessDistanceM",status)
            SELECT ${context.tenantId}::uuid,${datasetId}::uuid,${attempt.selectedCandidateId}::uuid,'MOTOR_VEHICLE',id,location,${example.accessM},'AUTO_ACCEPTED'
            FROM "RoadNode" WHERE id=${example.nodeId}::uuid AND "datasetId"=${datasetId}::uuid
          `;
          await tx.package.update({
            where: {
              tenantId_id: { tenantId: context.tenantId, id: packageId },
            },
            data: { geocodingAttemptId: attempt.id },
          });
        });
      }
      const packageId = pkg.id;
      const current = await runWithTenant(db, context.tenantId, (tx) =>
        tx.package.findFirstOrThrow({
          where: { tenantId: context.tenantId, id: packageId },
        }),
      );
      packages.push({
        packageId: current.id,
        trackingCode,
        address: example.address,
        state: current.state,
      });
    }
    const preparation = { datasetId, depotId, packages };
    if (!options.quiet)
      process.stdout.write(`${JSON.stringify(preparation, null, 2)}\n`);
    return preparation;
  } finally {
    await db.$disconnect();
  }
}

if (require.main === module)
  prepareOsmDemo().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
