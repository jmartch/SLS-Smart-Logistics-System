import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { seedDemo, DEMO_IDS, DEMO_CREDENTIALS } from '../prisma/seed-demo';
import { prepareOsmDemo } from '../prisma/prepare-osm-demo';

describe('Demo seed and current web workflow', () => {
  jest.setTimeout(120_000);
  const admin = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  let app: INestApplication;

  beforeAll(async () => {
    // The destructive seed test may only run in its dedicated disposable DB.
    const url = new URL(process.env.DATABASE_URL!);
    if (!/^\/sls_demo01_[0-9a-f]{32}$/.test(url.pathname))
      throw new Error('DEMO-01 requires a disposable sls_demo01_* database');
    await seedDemo({ resetAll: true });
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
    await admin.$disconnect();
  });

  async function login(email = DEMO_CREDENTIALS.adminEmail) {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        slug: DEMO_IDS.tenantSlug,
        email,
        password: DEMO_CREDENTIALS.password,
      })
      .expect(200);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    return cookies
      .find((cookie) => cookie.startsWith('sls_session='))!
      .split(';')[0];
  }

  it('starts at reception with geocoded packages, real initial history and free resources', async () => {
    const packages = await admin.package.findMany({
      include: { geocodingAttempt: true, statusHistory: true },
    });
    expect(packages).toHaveLength(3);
    for (const pkg of packages) {
      expect(pkg.state).toBe('REGISTERED');
      expect(pkg.zoneId).toBeNull();
      expect(pkg.geocodingAttempt?.status).toBe('MATCHED');
      expect(pkg.statusHistory).toHaveLength(1);
      expect(pkg.statusHistory[0]).toMatchObject({
        fromState: null,
        toState: 'REGISTERED',
        reasonCode: 'PACKAGE_REGISTERED',
      });
    }
    expect(
      await admin.outboxEvent.count({
        where: { eventType: 'PackageRegistered' },
      }),
    ).toBe(3);
    expect(await admin.route.count()).toBe(0);
    expect(await admin.assignment.count()).toBe(0);
    expect(await admin.deadLetterMessage.count()).toBe(0);
    expect(await admin.vehicleShift.count()).toBe(0);
    expect(await admin.courierShift.count()).toBe(0);
    const cookie = await login();
    const workspace = await request(app.getHttpServer())
      .get('/api/v1/routes/planning/workspace')
      .query({
        startAt: '2026-10-13T08:00:00.000Z',
        endAt: '2026-10-13T13:00:00.000Z',
      })
      .set('Cookie', cookie)
      .expect(200);
    expect(
      workspace.body.vehicles.filter(
        (v: { isEligible: boolean }) => v.isEligible,
      ),
    ).toHaveLength(1);
    expect(
      workspace.body.couriers.filter(
        (c: { isEligible: boolean }) => c.isEligible,
      ),
    ).toHaveLength(1);
    expect(workspace.body.candidatePackages).toHaveLength(0);
    const eligible = await request(app.getHttpServer())
      .get('/api/v1/couriers/eligible-users')
      .set('Cookie', cookie)
      .expect(200);
    expect(JSON.stringify(eligible.body)).toContain(
      DEMO_IDS.candidateCourierUserId,
    );
    await prepareOsmDemo({ quiet: true });
    expect(await admin.package.count()).toBe(3);
    expect(await admin.packageStatusHistory.count()).toBe(3);
  });

  it('classifies, plans, recovers a real pending package and freezes the prepared manifest through HTTP', async () => {
    const cookie = await login();
    const packages = await admin.package.findMany({
      orderBy: { trackingCode: 'asc' },
    });
    for (const pkg of packages)
      await request(app.getHttpServer())
        .post(`/api/v1/packages/${pkg.id}/classify`)
        .set('Cookie', cookie)
        .send({ zoneId: DEMO_IDS.zoneId, sectorId: DEMO_IDS.sectorId })
        .expect(200);
    const workspace = await request(app.getHttpServer())
      .get('/api/v1/routes/planning/workspace')
      .set('Cookie', cookie)
      .expect(200);
    expect(
      workspace.body.candidatePackages.every(
        (p: { hasReadyCoordinates: boolean }) => p.hasReadyCoordinates,
      ),
    ).toBe(true);
    const day = new Date().toISOString().slice(0, 10);
    const command = {
      zoneId: DEMO_IDS.zoneId,
      depotId: workspace.body.depots[0].id,
      datasetId: workspace.body.datasets[0].id,
      resourceSelection: 'AUTOMATIC',
      window: {
        startAt: `${day}T08:00:00.000Z`,
        endAt: `${day}T13:00:00.000Z`,
      },
      radiusMeters: 2500,
      ordering: 'nearest-neighbor',
    };
    const planned = await request(app.getHttpServer())
      .post('/api/v1/routes/planning/plan-and-assign')
      .set('Cookie', cookie)
      .send({
        ...command,
        requestId: randomUUID(),
        packageIds: packages.slice(0, 2).map((p) => p.id),
      })
      .expect(201);
    expect(planned.body.routes).toHaveLength(1);
    const routeId = planned.body.routes[0].routeId as string;
    const remaining = packages[2].id;
    const pending = await request(app.getHttpServer())
      .post('/api/v1/routes/planning/plan-and-assign')
      .set('Cookie', cookie)
      .send({ ...command, requestId: randomUUID(), packageIds: [remaining] })
      .expect(201);
    expect(pending.body.routes).toHaveLength(0);
    expect(pending.body.outcomes[0]).toMatchObject({
      kind: 'PENDING_ASSIGNMENT',
      packageId: remaining,
    });
    expect(
      (await admin.package.findUniqueOrThrow({ where: { id: remaining } }))
        .state,
    ).toBe('PENDING_ASSIGNMENT');

    const recovered = await request(app.getHttpServer())
      .post(`/api/v1/routes/planning/routes/${routeId}/replan`)
      .set('Cookie', cookie)
      .send({ packageIds: [remaining], ordering: 'nearest-neighbor' })
      .expect(200);
    expect(recovered.body.stops).toHaveLength(3);
    expect(
      await admin.assignment.count({
        where: { packageId: remaining, status: 'ACTIVE' },
      }),
    ).toBe(1);
    const history = await admin.packageStatusHistory.findMany({
      where: { packageId: remaining },
    });
    expect(history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fromState: 'PENDING_ASSIGNMENT',
          toState: 'ASSIGNED_TO_ROUTE',
        }),
      ]),
    );
    expect(
      await admin.outboxEvent.count({
        where: { eventType: 'PackageAssigned' },
      }),
    ).toBe(3);

    const courierCookie = await login(DEMO_CREDENTIALS.courierEmail);
    await request(app.getHttpServer())
      .post(`/api/v1/routes/planning/routes/${routeId}/replan`)
      .set('Cookie', courierCookie)
      .send({ packageIds: [] })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/v1/routes/${routeId}/prepare`)
      .set('Cookie', cookie)
      .send({ depotConfirmed: true })
      .expect(200);
    const before = await admin.assignment.count();
    await request(app.getHttpServer())
      .post(`/api/v1/routes/planning/routes/${routeId}/replan`)
      .set('Cookie', cookie)
      .send({ packageIds: [remaining] })
      .expect(409);
    expect(await admin.assignment.count()).toBe(before);
    expect(
      await admin.package.count({ where: { state: 'READY_FOR_DISPATCH' } }),
    ).toBe(3);
    expect(
      await admin.outboxEvent.count({ where: { eventType: 'RoutePrepared' } }),
    ).toBe(1);
    // Preserve the final prepared state to test repeatability after actual use.
  });

  it('reseeds after real operations, preserves other tenants by default and explicitly resets all operational data', async () => {
    const otherTenant = randomUUID();
    await admin.tenant.create({
      data: {
        id: otherTenant,
        name: 'Other tenant',
        slug: `other-${otherTenant}`,
      },
    });
    await seedDemo();
    expect(await admin.tenant.count({ where: { id: otherTenant } })).toBe(1);
    expect(await admin.route.count()).toBe(0);
    expect(await admin.assignment.count()).toBe(0);
    expect(
      await admin.session.count({ where: { tenantId: DEMO_IDS.tenantId } }),
    ).toBe(0);
    expect(await admin.package.count({ where: { state: 'REGISTERED' } })).toBe(
      3,
    );
    expect(
      await admin.outboxEvent.count({
        where: { eventType: 'PackageRegistered' },
      }),
    ).toBe(3);
    const migrationsBefore = await admin.$queryRaw<
      Array<{ count: bigint }>
    >`SELECT count(*) FROM "_prisma_migrations"`;
    await seedDemo({ resetAll: true });
    expect(await admin.tenant.count()).toBe(1);
    expect(await admin.package.count()).toBe(3);
    expect(await admin.geoDataset.count()).toBe(1);
    expect(await admin.route.count()).toBe(0);
    const migrationsAfter = await admin.$queryRaw<
      Array<{ count: bigint }>
    >`SELECT count(*) FROM "_prisma_migrations"`;
    expect(migrationsAfter).toEqual(migrationsBefore);
  });
});
