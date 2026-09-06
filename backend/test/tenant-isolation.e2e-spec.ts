import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaService } from '../src/database/prisma.service';
import { runWithTenant } from '../src/database/run-with-tenant';

describe('Tenant isolation (RLS)', () => {
  const admin = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const app = new PrismaService();

  let tenantAId: string;
  let tenantBId: string;

  beforeAll(async () => {
    await admin.$connect();
    await app.onModuleInit();

    const tenantA = await admin.tenant.create({
      data: { name: 'Tenant A' },
    });
    const tenantB = await admin.tenant.create({
      data: { name: 'Tenant B' },
    });
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    const zoneA = await admin.zone.create({
      data: { tenantId: tenantAId, code: 'A-Z1', name: 'Zone A1' },
    });
    const shipmentTypeA = await admin.shipmentType.create({
      data: { tenantId: tenantAId, code: 'A-ST1', name: 'Standard' },
    });
    await admin.package.create({
      data: {
        tenantId: tenantAId,
        zoneId: zoneA.id,
        shipmentTypeId: shipmentTypeA.id,
        trackingCode: 'TRACK-A-1',
        publicTrackingToken: 'TOKEN-A-1',
        weightKg: '1.5',
        volumeM3: '0.1',
        latitude: '10.0',
        longitude: '-74.0',
      },
    });

    const zoneB = await admin.zone.create({
      data: { tenantId: tenantBId, code: 'B-Z1', name: 'Zone B1' },
    });
    const shipmentTypeB = await admin.shipmentType.create({
      data: { tenantId: tenantBId, code: 'B-ST1', name: 'Standard' },
    });
    await admin.package.create({
      data: {
        tenantId: tenantBId,
        zoneId: zoneB.id,
        shipmentTypeId: shipmentTypeB.id,
        trackingCode: 'TRACK-B-1',
        publicTrackingToken: 'TOKEN-B-1',
        weightKg: '2.5',
        volumeM3: '0.2',
        latitude: '11.0',
        longitude: '-75.0',
      },
    });
  });

  afterAll(async () => {
    await admin.package.deleteMany({
      where: { tenantId: { in: [tenantAId, tenantBId] } },
    });
    await admin.shipmentType.deleteMany({
      where: { tenantId: { in: [tenantAId, tenantBId] } },
    });
    await admin.zone.deleteMany({
      where: { tenantId: { in: [tenantAId, tenantBId] } },
    });
    await admin.tenant.deleteMany({
      where: { id: { in: [tenantAId, tenantBId] } },
    });
    await admin.$disconnect();
    await app.onModuleDestroy();
  });

  it('returns zero rows on the sls_app connection with no tenant set', async () => {
    const packages = await app.package.findMany();
    expect(packages).toHaveLength(0);
  });

  it('returns only tenant A packages when scoped to tenant A', async () => {
    const packages = await runWithTenant(app, tenantAId, (tx) =>
      tx.package.findMany(),
    );
    expect(packages).toHaveLength(1);
    expect(packages[0].trackingCode).toBe('TRACK-A-1');
  });

  it('returns only tenant B packages when scoped to tenant B', async () => {
    const packages = await runWithTenant(app, tenantBId, (tx) =>
      tx.package.findMany(),
    );
    expect(packages).toHaveLength(1);
    expect(packages[0].trackingCode).toBe('TRACK-B-1');
  });
});
