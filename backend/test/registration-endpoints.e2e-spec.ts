import { randomUUID } from 'node:crypto';
import { INestApplication, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { AppModule } from '../src/app.module';

describe('Registration endpoints E2E (VEH-01 / PKG-01)', () => {
  let app: INestApplication<App>;
  let server: App;

  const admin = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const tenantIds = [tenantA, tenantB];

  const userActiveA = randomUUID();
  const userSuspendedA = randomUUID();
  const userActiveB = randomUUID();

  const shipmentTypeA = randomUUID();
  const shipmentTypeInactiveA = randomUUID();
  const zoneNorthA = randomUUID();
  const zoneSouthA = randomUUID();
  const sectorNorthA = randomUUID();

  function post(path: string, tenantId: string, body: object) {
    return request(server).post(path).set('x-tenant-id', tenantId).send(body);
  }

  beforeAll(async () => {
    await admin.$connect();

    await admin.tenant.createMany({
      data: [
        { id: tenantA, name: `Registration E2E Tenant A ${tenantA}` },
        { id: tenantB, name: `Registration E2E Tenant B ${tenantB}` },
      ],
    });

    await admin.user.createMany({
      data: [
        {
          id: userActiveA,
          tenantId: tenantA,
          email: `activo.a.${userActiveA}@e2e.local`,
          passwordHash: 'no-login',
          status: 'ACTIVE',
        },
        {
          id: userSuspendedA,
          tenantId: tenantA,
          email: `suspendido.a.${userSuspendedA}@e2e.local`,
          passwordHash: 'no-login',
          status: 'SUSPENDED',
        },
        {
          id: userActiveB,
          tenantId: tenantB,
          email: `activo.b.${userActiveB}@e2e.local`,
          passwordHash: 'no-login',
          status: 'ACTIVE',
        },
      ],
    });

    await admin.shipmentType.createMany({
      data: [
        {
          id: shipmentTypeA,
          tenantId: tenantA,
          code: 'STANDARD',
          name: 'Standard',
        },
        {
          id: shipmentTypeInactiveA,
          tenantId: tenantA,
          code: 'LEGACY',
          name: 'Legacy',
          active: false,
        },
      ],
    });

    await admin.zone.createMany({
      data: [
        { id: zoneNorthA, tenantId: tenantA, code: 'NORTH', name: 'North' },
        { id: zoneSouthA, tenantId: tenantA, code: 'SOUTH', name: 'South' },
      ],
    });

    await admin.sector.create({
      data: {
        id: sectorNorthA,
        tenantId: tenantA,
        zoneId: zoneNorthA,
        code: 'N1',
        name: 'North 1',
      },
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });

    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    try {
      const where = { tenantId: { in: tenantIds } };

      await admin.packageStatusHistory.deleteMany({ where });
      await admin.package.deleteMany({ where });
      await admin.address.deleteMany({ where });
      await admin.courier.deleteMany({ where });
      await admin.vehicle.deleteMany({ where });
      await admin.user.deleteMany({ where });
      await admin.sector.deleteMany({ where });
      await admin.zone.deleteMany({ where });
      await admin.shipmentType.deleteMany({ where });
      await admin.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    } finally {
      await admin.$disconnect();
      if (app) {
        await app.close();
      }
    }
  });

  describe('Tenant context', () => {
    it.each(['/api/v1/vehicles', '/api/v1/couriers', '/api/v1/packages'])(
      'rejects %s without a tenant header',
      async (path) => {
        const response = await request(server).post(path).send({});

        expect(response.status).toBe(401);
        expect(response.body).toMatchObject({ code: 'UNAUTHENTICATED' });
      },
    );
  });

  describe('POST /vehicles', () => {
    const validVehicle = {
      plate: 'abc-123',
      maxWeightKg: 1200.5,
      maxVolumeM3: 8.25,
    };

    it('persists a normalized vehicle for the tenant', async () => {
      const response = await post('/api/v1/vehicles', tenantA, validVehicle);

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        tenantId: tenantA,
        plate: 'ABC123',
        maxWeightKg: '1200.5',
        maxVolumeM3: '8.25',
        status: 'ACTIVE',
      });

      const stored = await admin.vehicle.findFirst({
        where: { tenantId: tenantA, plate: 'ABC123' },
      });
      expect(stored).not.toBeNull();
      expect(stored?.maxWeightKg.toString()).toBe('1200.5');
    });

    it('rejects the same plate in the same tenant, however it is written', async () => {
      const response = await post('/api/v1/vehicles', tenantA, {
        ...validVehicle,
        plate: 'ABC 123',
      });

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ code: 'VEHICLE_PLATE_CONFLICT' });
      expect(await admin.vehicle.count({ where: { tenantId: tenantA } })).toBe(
        1,
      );
    });

    it('allows the same plate in a different tenant', async () => {
      const response = await post('/api/v1/vehicles', tenantB, validVehicle);

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        tenantId: tenantB,
        plate: 'ABC123',
      });
      expect(
        await admin.vehicle.count({
          where: { plate: 'ABC123', tenantId: { in: tenantIds } },
        }),
      ).toBe(2);
    });

    it.each([
      [{ plate: 'XYZ789', maxWeightKg: 0, maxVolumeM3: 5 }, 'maxWeightKg'],
      [
        { plate: 'XYZ789', maxWeightKg: 100, maxVolumeM3: 1.0000001 },
        'maxVolumeM3',
      ],
      [{ plate: 'AB', maxWeightKg: 100, maxVolumeM3: 5 }, 'plate'],
    ])('rejects invalid input %j without persisting', async (body, field) => {
      const before = await admin.vehicle.count({
        where: { tenantId: tenantA },
      });

      const response = await post('/api/v1/vehicles', tenantA, body);

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(Object.keys((response.body as { fields: object }).fields)).toEqual(
        [field],
      );
      expect(await admin.vehicle.count({ where: { tenantId: tenantA } })).toBe(
        before,
      );
    });
  });

  describe('POST /couriers', () => {
    it('links an active user of the same tenant', async () => {
      const response = await post('/api/v1/couriers', tenantA, {
        userId: userActiveA,
      });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        tenantId: tenantA,
        userId: userActiveA,
        status: 'ACTIVE',
      });
      expect(
        await admin.courier.count({
          where: { tenantId: tenantA, userId: userActiveA },
        }),
      ).toBe(1);
    });

    it('rejects linking the same user twice', async () => {
      const response = await post('/api/v1/couriers', tenantA, {
        userId: userActiveA,
      });

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        code: 'COURIER_USER_ALREADY_LINKED',
      });
      expect(await admin.courier.count({ where: { tenantId: tenantA } })).toBe(
        1,
      );
    });

    it('rejects a suspended user', async () => {
      const response = await post('/api/v1/couriers', tenantA, {
        userId: userSuspendedA,
      });

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        code: 'COURIER_USER_NOT_ELIGIBLE',
      });
    });

    it('does not reveal or link a user from another tenant', async () => {
      const response = await post('/api/v1/couriers', tenantA, {
        userId: userActiveB,
      });

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ code: 'COURIER_USER_NOT_FOUND' });
      expect(
        await admin.courier.count({ where: { userId: userActiveB } }),
      ).toBe(0);
    });

    it('rejects a malformed userId', async () => {
      const response = await post('/api/v1/couriers', tenantA, {
        userId: 'hola',
      });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('links the tenant B user from tenant B', async () => {
      const response = await post('/api/v1/couriers', tenantB, {
        userId: userActiveB,
      });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        tenantId: tenantB,
        userId: userActiveB,
      });
    });
  });

  describe('POST /packages', () => {
    function validPackage(overrides: Record<string, unknown> = {}) {
      return {
        trackingCode: `pkg-${randomUUID().slice(0, 8)}`,
        address: { text: 'Calle 72 # 45-10', municipalityCode: '08001' },
        shipmentTypeId: shipmentTypeA,
        weightKg: 2.5,
        lengthCm: 30,
        widthCm: 20,
        heightCm: 10,
        ...overrides,
      };
    }

    async function counts(tenantId: string) {
      return {
        packages: await admin.package.count({ where: { tenantId } }),
        addresses: await admin.address.count({ where: { tenantId } }),
        history: await admin.packageStatusHistory.count({
          where: { tenantId },
        }),
      };
    }

    it('registers package, address and initial history atomically', async () => {
      const before = await counts(tenantA);
      const outboxBefore = await admin.outboxEvent.count({
        where: { tenantId: tenantA },
      });

      const response = await post(
        '/api/v1/packages',
        tenantA,
        validPackage({
          trackingCode: 'pkg-main-1',
          zoneId: zoneNorthA,
          sectorId: sectorNorthA,
          priority: 'high',
          deadline: '2026-10-20T17:00:00Z',
          serviceDurationSeconds: 300,
        }),
      );

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        tenantId: tenantA,
        trackingCode: 'PKG-MAIN-1',
        state: 'REGISTERED',
        volumeM3: '0.006',
        priority: 'HIGH',
        zoneId: zoneNorthA,
        sectorId: sectorNorthA,
      });

      const body = response.body as { id: string; publicTrackingToken: string };
      expect(body.publicTrackingToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

      const after = await counts(tenantA);
      expect(after.packages).toBe(before.packages + 1);
      expect(after.addresses).toBe(before.addresses + 1);
      expect(after.history).toBe(before.history + 1);

      const history = await admin.packageStatusHistory.findMany({
        where: { tenantId: tenantA, packageId: body.id },
      });
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        fromState: null,
        toState: 'REGISTERED',
        reasonCode: 'PACKAGE_REGISTERED',
      });

      // Decisión documentada: el registro no publica evento de outbox.
      expect(
        await admin.outboxEvent.count({ where: { tenantId: tenantA } }),
      ).toBe(outboxBefore);
    });

    it('generates a different public token for every package', async () => {
      const first = await post('/api/v1/packages', tenantA, validPackage());
      const second = await post('/api/v1/packages', tenantA, validPackage());

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(
        (first.body as { publicTrackingToken: string }).publicTrackingToken,
      ).not.toBe(
        (second.body as { publicTrackingToken: string }).publicTrackingToken,
      );
    });

    it.each([
      ['12.34', '5.67', '8.9', '0.000623'],
      ['0.5', '0.5', '2', '0.000001'],
      ['30', '20', '10', '0.006'],
    ])(
      'computes a volume the database check accepts (%s x %s x %s cm)',
      async (length, width, height, expected) => {
        const response = await post(
          '/api/v1/packages',
          tenantA,
          validPackage({ lengthCm: length, widthCm: width, heightCm: height }),
        );

        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({ volumeM3: expected });
      },
    );

    it('rolls back everything when the tracking code already exists', async () => {
      await post(
        '/api/v1/packages',
        tenantA,
        validPackage({ trackingCode: 'PKG-DUP-1' }),
      );
      const before = await counts(tenantA);

      const response = await post(
        '/api/v1/packages',
        tenantA,
        validPackage({ trackingCode: 'pkg-dup-1' }),
      );

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        code: 'PACKAGE_TRACKING_CODE_CONFLICT',
      });
      expect(await counts(tenantA)).toEqual(before);
    });

    it('lets exactly one of two concurrent requests win', async () => {
      const before = await counts(tenantA);
      const body = validPackage({ trackingCode: 'PKG-RACE-1' });

      const [first, second] = await Promise.all([
        post('/api/v1/packages', tenantA, body),
        post('/api/v1/packages', tenantA, body),
      ]);

      expect([first.status, second.status].sort((a, b) => a - b)).toEqual([
        201, 409,
      ]);

      const after = await counts(tenantA);
      expect(after.packages).toBe(before.packages + 1);
      expect(after.addresses).toBe(before.addresses + 1);
      expect(after.history).toBe(before.history + 1);
    });

    it('does not use a shipment type from another tenant', async () => {
      const before = await counts(tenantB);

      const response = await post('/api/v1/packages', tenantB, validPackage());

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        code: 'PACKAGE_SHIPMENT_TYPE_NOT_FOUND',
      });
      expect(await counts(tenantB)).toEqual(before);
    });

    it.each([
      [
        { shipmentTypeId: shipmentTypeInactiveA },
        409,
        'PACKAGE_SHIPMENT_TYPE_INACTIVE',
      ],
      [{ zoneId: randomUUID() }, 404, 'PACKAGE_ZONE_NOT_FOUND'],
      [
        { zoneId: zoneNorthA, sectorId: randomUUID() },
        404,
        'PACKAGE_SECTOR_NOT_FOUND',
      ],
      [
        { zoneId: zoneSouthA, sectorId: sectorNorthA },
        409,
        'PACKAGE_SECTOR_ZONE_MISMATCH',
      ],
    ])(
      'rejects invalid references %j without persisting',
      async (overrides, status, code) => {
        const before = await counts(tenantA);

        const response = await post(
          '/api/v1/packages',
          tenantA,
          validPackage(overrides),
        );

        expect(response.status).toBe(status);
        expect(response.body).toMatchObject({ code });
        expect(await counts(tenantA)).toEqual(before);
      },
    );

    it.each([
      [{ weightKg: 0 }, 'weightKg'],
      [{ lengthCm: 0.01, widthCm: 0.01, heightCm: 0.01 }, 'volumeM3'],
      [{ sectorId: sectorNorthA }, 'sectorId'],
      [{ trackingCode: 'x' }, 'trackingCode'],
    ])(
      'rejects invalid input %j without persisting',
      async (overrides, field) => {
        const before = await counts(tenantA);

        const response = await post(
          '/api/v1/packages',
          tenantA,
          validPackage(overrides),
        );

        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR' });
        expect(
          Object.keys((response.body as { fields: object }).fields),
        ).toEqual([field]);
        expect(await counts(tenantA)).toEqual(before);
      },
    );

    it('allows the same tracking code in another tenant', async () => {
      await admin.shipmentType.create({
        data: { tenantId: tenantB, code: 'STANDARD', name: 'Standard B' },
      });
      const typeB = await admin.shipmentType.findFirstOrThrow({
        where: { tenantId: tenantB, code: 'STANDARD' },
      });

      const response = await post(
        '/api/v1/packages',
        tenantB,
        validPackage({ trackingCode: 'PKG-DUP-1', shipmentTypeId: typeB.id }),
      );

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        tenantId: tenantB,
        trackingCode: 'PKG-DUP-1',
      });
    });
  });
});
