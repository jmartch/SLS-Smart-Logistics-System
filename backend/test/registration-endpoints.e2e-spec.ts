import { randomBytes, randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { hashPassword } from '../src/modules/auth/domain/password-hasher';

const COOKIE_NAME = 'sls_session';

function sessionCookie(response: request.Response): string {
  const value: unknown = response.headers['set-cookie'];
  const headers = Array.isArray(value) ? (value as string[]) : [];
  const header = headers.find((h) => h.startsWith(`${COOKIE_NAME}=`));
  if (!header) {
    throw new Error('login response did not set the session cookie');
  }
  return header.split(';')[0];
}

describe('Registration endpoints E2E (VEH-01 / PKG-01)', () => {
  jest.setTimeout(90_000);

  let app: INestApplication<App>;
  let server: App;

  const admin = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  const run = randomUUID().slice(0, 8);
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const slugA = `reg-e2e-a-${run}`;
  const slugB = `reg-e2e-b-${run}`;
  const tenantIds = [tenantA, tenantB];

  const userActiveA = randomUUID();
  const userReceptionOnlyA = randomUUID();
  const userAdminOnlyA = randomUUID();
  const userSuspendedA = randomUUID();
  const userActiveB = randomUUID();

  const shipmentTypeA = randomUUID();
  const shipmentTypeInactiveA = randomUUID();
  const zoneNorthA = randomUUID();
  const zoneSouthA = randomUUID();
  const sectorNorthA = randomUUID();

  let cookieA: string;
  let cookieB: string;
  let cookieReceptionOnlyA: string;
  let cookieAdminOnlyA: string;

  function post(path: string, cookie: string, body: object) {
    return request(server).post(path).set('Cookie', cookie).send(body);
  }

  async function login(
    slug: string,
    email: string,
    password: string,
  ): Promise<string> {
    const response = await request(server)
      .post('/api/v1/auth/login')
      .send({ slug, email, password });

    expect(response.status).toBe(200);
    return sessionCookie(response);
  }

  beforeAll(async () => {
    await admin.$connect();

    const password = randomBytes(18).toString('base64url');
    const passwordHash = await hashPassword(password);

    const [manageTenantPerm, registerPackagesPerm] = await Promise.all([
      admin.permission.findUnique({ where: { code: 'MANAGE_TENANT' } }),
      admin.permission.findUnique({ where: { code: 'REGISTER_PACKAGES' } }),
    ]);
    if (!manageTenantPerm || !registerPackagesPerm) {
      throw new Error(
        'Seeded MANAGE_TENANT or REGISTER_PACKAGES permission is missing.',
      );
    }

    await admin.tenant.createMany({
      data: [
        {
          id: tenantA,
          name: `Registration E2E Tenant A ${tenantA}`,
          slug: slugA,
        },
        {
          id: tenantB,
          name: `Registration E2E Tenant B ${tenantB}`,
          slug: slugB,
        },
      ],
    });

    const emailActiveA = `activo.a.${userActiveA}@e2e.local`;
    const emailReceptionOnlyA = `recepcion.a.${userReceptionOnlyA}@e2e.local`;
    const emailAdminOnlyA = `admin.a.${userAdminOnlyA}@e2e.local`;
    const emailActiveB = `activo.b.${userActiveB}@e2e.local`;

    await admin.user.createMany({
      data: [
        {
          id: userActiveA,
          tenantId: tenantA,
          email: emailActiveA,
          passwordHash,
          status: 'ACTIVE',
        },
        {
          id: userReceptionOnlyA,
          tenantId: tenantA,
          email: emailReceptionOnlyA,
          passwordHash,
          status: 'ACTIVE',
        },
        {
          id: userAdminOnlyA,
          tenantId: tenantA,
          email: emailAdminOnlyA,
          passwordHash,
          status: 'ACTIVE',
        },
        {
          id: userSuspendedA,
          tenantId: tenantA,
          email: `suspendido.a.${userSuspendedA}@e2e.local`,
          passwordHash,
          status: 'SUSPENDED',
        },
        {
          id: userActiveB,
          tenantId: tenantB,
          email: emailActiveB,
          passwordHash,
          status: 'ACTIVE',
        },
      ],
    });

    const [roleFullA, roleReceptionA, roleAdminA, roleFullB] =
      await Promise.all([
        admin.role.create({ data: { tenantId: tenantA, name: 'Operador A' } }),
        admin.role.create({
          data: { tenantId: tenantA, name: 'Recepcionista A' },
        }),
        admin.role.create({
          data: { tenantId: tenantA, name: 'Admin Tenant A' },
        }),
        admin.role.create({ data: { tenantId: tenantB, name: 'Operador B' } }),
      ]);

    await admin.rolePermission.createMany({
      data: [
        {
          tenantId: tenantA,
          roleId: roleFullA.id,
          permissionId: manageTenantPerm.id,
        },
        {
          tenantId: tenantA,
          roleId: roleFullA.id,
          permissionId: registerPackagesPerm.id,
        },
        {
          tenantId: tenantA,
          roleId: roleReceptionA.id,
          permissionId: registerPackagesPerm.id,
        },
        {
          tenantId: tenantA,
          roleId: roleAdminA.id,
          permissionId: manageTenantPerm.id,
        },
        {
          tenantId: tenantB,
          roleId: roleFullB.id,
          permissionId: manageTenantPerm.id,
        },
        {
          tenantId: tenantB,
          roleId: roleFullB.id,
          permissionId: registerPackagesPerm.id,
        },
      ],
    });

    await admin.userRole.createMany({
      data: [
        { tenantId: tenantA, userId: userActiveA, roleId: roleFullA.id },
        {
          tenantId: tenantA,
          userId: userReceptionOnlyA,
          roleId: roleReceptionA.id,
        },
        { tenantId: tenantA, userId: userAdminOnlyA, roleId: roleAdminA.id },
        { tenantId: tenantB, userId: userActiveB, roleId: roleFullB.id },
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
    configureApp(app);

    await app.init();
    server = app.getHttpServer();

    cookieA = await login(slugA, emailActiveA, password);
    cookieB = await login(slugB, emailActiveB, password);
    cookieReceptionOnlyA = await login(slugA, emailReceptionOnlyA, password);
    cookieAdminOnlyA = await login(slugA, emailAdminOnlyA, password);
  });

  afterAll(async () => {
    try {
      const where = { tenantId: { in: tenantIds } };

      await admin.outboxEvent.deleteMany({ where });
      await admin.packageStatusHistory.deleteMany({ where });
      await admin.package.deleteMany({ where });
      await admin.address.deleteMany({ where });
      await admin.courier.deleteMany({ where });
      await admin.vehicle.deleteMany({ where });
      await admin.session.deleteMany({ where });
      await admin.userRole.deleteMany({ where });
      await admin.rolePermission.deleteMany({ where });
      await admin.role.deleteMany({ where });
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

  describe('Authentication, authorization and tenant context', () => {
    it.each(['/api/v1/vehicles', '/api/v1/couriers', '/api/v1/packages'])(
      'rejects %s with 401 without an authenticated session even when x-tenant-id is sent',
      async (path) => {
        const response = await request(server)
          .post(path)
          .set('x-tenant-id', tenantA)
          .send({});

        expect(response.status).toBe(401);
        expect(response.body).toMatchObject({
          error: { code: 'SESSION_EXPIRED' },
        });
      },
    );

    it.each(['/api/v1/vehicles', '/api/v1/couriers'])(
      'rejects %s with 403 when the session lacks MANAGE_TENANT',
      async (path) => {
        const response = await post(path, cookieReceptionOnlyA, {});

        expect(response.status).toBe(403);
        expect(response.body).toMatchObject({
          error: { code: 'PERMISSION_DENIED' },
        });
      },
    );

    it('rejects POST /api/v1/packages with 403 when the session lacks REGISTER_PACKAGES', async () => {
      const response = await post('/api/v1/packages', cookieAdminOnlyA, {});

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        error: { code: 'PERMISSION_DENIED' },
      });
    });

    it('ignores x-tenant-id header for another tenant and uses the authenticated session tenant', async () => {
      const response = await request(server)
        .post('/api/v1/packages')
        .set('Cookie', cookieA)
        .set('x-tenant-id', tenantB)
        .send({
          trackingCode: 'PKG-IGNORE-HEADER',
          address: { text: 'Calle 84 # 50-12', municipalityCode: '08001' },
          shipmentTypeId: shipmentTypeA,
          weightKg: 1.5,
          lengthCm: 20,
          widthCm: 15,
          heightCm: 10,
        });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        tenantId: tenantA,
        trackingCode: 'PKG-IGNORE-HEADER',
      });
      expect(
        await admin.package.count({
          where: { tenantId: tenantB, trackingCode: 'PKG-IGNORE-HEADER' },
        }),
      ).toBe(0);
    });
  });

  describe('POST /vehicles', () => {
    const validVehicle = {
      plate: 'abc-123',
      maxWeightKg: 1200.5,
      maxVolumeM3: 8.25,
    };

    it('persists a normalized vehicle for the tenant', async () => {
      const response = await post('/api/v1/vehicles', cookieA, validVehicle);

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
      const response = await post('/api/v1/vehicles', cookieA, {
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
      const response = await post('/api/v1/vehicles', cookieB, validVehicle);

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

      const response = await post('/api/v1/vehicles', cookieA, body);

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
      const response = await post('/api/v1/couriers', cookieA, {
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
      const response = await post('/api/v1/couriers', cookieA, {
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
      const response = await post('/api/v1/couriers', cookieA, {
        userId: userSuspendedA,
      });

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        code: 'COURIER_USER_NOT_ELIGIBLE',
      });
    });

    it('does not reveal or link a user from another tenant', async () => {
      const response = await post('/api/v1/couriers', cookieA, {
        userId: userActiveB,
      });

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ code: 'COURIER_USER_NOT_FOUND' });
      expect(
        await admin.courier.count({ where: { userId: userActiveB } }),
      ).toBe(0);
    });

    it('rejects a malformed userId', async () => {
      const response = await post('/api/v1/couriers', cookieA, {
        userId: 'hola',
      });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('links the tenant B user from tenant B', async () => {
      const response = await post('/api/v1/couriers', cookieB, {
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
        outbox: await admin.outboxEvent.count({
          where: { tenantId, eventType: 'PackageRegistered' },
        }),
      };
    }

    it('registers package, address, initial history with changedByUserId and PackageRegistered outbox event atomically', async () => {
      const before = await counts(tenantA);

      const response = await post(
        '/api/v1/packages',
        cookieA,
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
      expect(after.outbox).toBe(before.outbox + 1);

      const history = await admin.packageStatusHistory.findMany({
        where: { tenantId: tenantA, packageId: body.id },
      });
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        fromState: null,
        toState: 'REGISTERED',
        reasonCode: 'PACKAGE_REGISTERED',
        changedByUserId: userActiveA,
      });

      const outboxEvents = await admin.outboxEvent.findMany({
        where: { tenantId: tenantA, eventType: 'PackageRegistered' },
        orderBy: { occurredAt: 'desc' },
      });
      const matchingOutbox = outboxEvents.find(
        (event) =>
          (event.payload as { packageId?: string }).packageId === body.id,
      );
      expect(matchingOutbox).toBeDefined();
      expect(matchingOutbox).toMatchObject({
        tenantId: tenantA,
        eventType: 'PackageRegistered',
        producer: 'sls-backend.packages',
        version: 1,
        publishedAt: null,
        payload: {
          packageId: body.id,
          toState: 'REGISTERED',
          changedByUserId: userActiveA,
        },
      });
    });

    it('generates a different public token for every package', async () => {
      const first = await post('/api/v1/packages', cookieA, validPackage());
      const second = await post('/api/v1/packages', cookieA, validPackage());

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
          cookieA,
          validPackage({ lengthCm: length, widthCm: width, heightCm: height }),
        );

        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({ volumeM3: expected });
      },
    );

    it('rolls back everything when the tracking code already exists', async () => {
      await post(
        '/api/v1/packages',
        cookieA,
        validPackage({ trackingCode: 'PKG-DUP-1' }),
      );
      const before = await counts(tenantA);

      const response = await post(
        '/api/v1/packages',
        cookieA,
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
        post('/api/v1/packages', cookieA, body),
        post('/api/v1/packages', cookieA, body),
      ]);

      expect([first.status, second.status].sort((a, b) => a - b)).toEqual([
        201, 409,
      ]);

      const after = await counts(tenantA);
      expect(after.packages).toBe(before.packages + 1);
      expect(after.addresses).toBe(before.addresses + 1);
      expect(after.history).toBe(before.history + 1);
      expect(after.outbox).toBe(before.outbox + 1);
    });

    it('does not use a shipment type from another tenant', async () => {
      const before = await counts(tenantB);

      const response = await post('/api/v1/packages', cookieB, validPackage());

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
          cookieA,
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
          cookieA,
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
        cookieB,
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
