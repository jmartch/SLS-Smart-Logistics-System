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
import { PrismaService } from '../src/database/prisma.service';
import { PrismaAssignmentReservation } from '../src/modules/assignments/infrastructure/prisma-assignment-reservation';
import { ManageVehicleService } from '../src/modules/vehicles/application/manage-vehicle.service';
import { ManageCourierService } from '../src/modules/couriers/application/manage-courier.service';
import { RegisterCourierService } from '../src/modules/couriers/application/register-courier.service';

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

      await admin.auditLog.deleteMany({ where });
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

  describe('GET /vehicles', () => {
    afterAll(async () => {
      await admin.vehicle.deleteMany({
        where: { tenantId: { in: tenantIds }, plate: { startsWith: 'LIST' } },
      });
    });
    it('rejects anonymous and reception-only reads', async () => {
      await request(server).get('/api/v1/vehicles').expect(401);
      await request(server)
        .get('/api/v1/vehicles')
        .set('Cookie', cookieReceptionOnlyA)
        .expect(403);
    });

    it('isolates tenant lists even when query and headers request another tenant', async () => {
      const a = await post('/api/v1/vehicles', cookieA, {
        plate: 'LISTA01',
        maxWeightKg: 10.001,
        maxVolumeM3: 1.000001,
      });
      const b = await post('/api/v1/vehicles', cookieB, {
        plate: 'LISTB01',
        maxWeightKg: 20,
        maxVolumeM3: 2,
      });
      expect(a.status).toBe(201);
      expect(b.status).toBe(201);
      const responseA = await request(server)
        .get('/api/v1/vehicles')
        .query({ search: 'LIST', tenantId: tenantB })
        .set('Cookie', cookieA)
        .set('x-tenant-id', tenantB)
        .expect(200);
      expect(responseA.body).toMatchObject({ total: 1, page: 1, pageSize: 20 });
      expect(responseA.body.items).toEqual([
        expect.objectContaining({
          id: a.body.id,
          tenantId: tenantA,
          remainingWeightKg: '10.001',
          remainingVolumeM3: '1.000001',
        }),
      ]);
      const responseB = await request(server)
        .get('/api/v1/vehicles')
        .query({ search: 'LIST' })
        .set('Cookie', cookieB)
        .expect(200);
      expect(responseB.body.items).toEqual([
        expect.objectContaining({ id: b.body.id, tenantId: tenantB }),
      ]);
    });

    it('paginates deterministically and validates filters', async () => {
      const response = await request(server)
        .get('/api/v1/vehicles')
        .query({ search: 'LIST', status: 'ACTIVE', page: 2, pageSize: 1 })
        .set('Cookie', cookieA)
        .expect(200);
      expect(response.body).toEqual({
        items: [],
        total: 1,
        page: 2,
        pageSize: 1,
      });
      await request(server)
        .get('/api/v1/vehicles')
        .query({ pageSize: 101 })
        .set('Cookie', cookieA)
        .expect(400);
      await request(server)
        .get('/api/v1/vehicles')
        .query({ status: 'INVALID' })
        .set('Cookie', cookieA)
        .expect(400);
    });

    it('subtracts active cargo exactly and excludes assignment history', async () => {
      const vehicle = await admin.vehicle.findFirstOrThrow({
        where: { tenantId: tenantA, plate: 'LISTA01' },
      });
      const courier = await admin.courier.create({
        data: { tenantId: tenantA, userId: userAdminOnlyA },
      });
      const planning = await admin.routePlanningRequest.create({
        data: {
          tenantId: tenantA,
          requestedByUserId: userActiveA,
          parameters: {},
        },
      });
      const route = await admin.route.create({
        data: {
          tenantId: tenantA,
          planningRequestId: planning.id,
          vehicleId: vehicle.id,
          courierId: courier.id,
          state: 'PLANNED',
        },
      });
      try {
        const response = await post('/api/v1/packages', cookieA, {
          trackingCode: `LOAD-${run}`,
          address: { text: 'Calle 72 # 45-10', municipalityCode: '08001' },
          shipmentTypeId: shipmentTypeA,
          weightKg: 0.002,
          lengthCm: 1,
          widthCm: 1,
          heightCm: 2,
        });
        expect(response.status).toBe(201);
        const assignment = {
          tenantId: tenantA,
          packageId: response.body.id as string,
          routeId: route.id,
          vehicleId: vehicle.id,
          courierId: courier.id,
          assignmentType: 'INITIAL' as const,
        };
        await admin.assignment.create({
          data: { ...assignment, status: 'ENDED', endedAt: new Date() },
        });
        await admin.assignment.create({
          data: { ...assignment, status: 'ACTIVE' },
        });
        const result = await request(server)
          .get('/api/v1/vehicles')
          .query({ search: 'LISTA01' })
          .set('Cookie', cookieA)
          .expect(200);
        expect(result.body.items[0]).toMatchObject({
          assignedWeightKg: '0.002',
          assignedVolumeM3: '0.000002',
          remainingWeightKg: '9.999',
          remainingVolumeM3: '0.999999',
        });
      } finally {
        await admin.assignment.deleteMany({
          where: { tenantId: tenantA, routeId: route.id },
        });
        await admin.route.delete({ where: { id: route.id } });
        await admin.routePlanningRequest.delete({ where: { id: planning.id } });
        await admin.courier.delete({ where: { id: courier.id } });
      }
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

  describe('Vehicle management', () => {
    let freeId: string;
    let busyId: string;
    let foreignId: string;
    let courierId: string;
    let routeId: string;
    let planningId: string;
    let incomingId: string;
    const patch = (path: string, body: object, cookie = cookieA) =>
      request(server).patch(path).set('Cookie', cookie).send(body);
    beforeAll(async () => {
      const free = await admin.vehicle.create({
        data: {
          tenantId: tenantA,
          plate: 'EDIT001',
          maxWeightKg: 10,
          maxVolumeM3: 1,
        },
      });
      const busy = await admin.vehicle.create({
        data: {
          tenantId: tenantA,
          plate: 'EDIT002',
          maxWeightKg: 10,
          maxVolumeM3: 1,
        },
      });
      const foreign = await admin.vehicle.create({
        data: {
          tenantId: tenantB,
          plate: 'EDIT003',
          maxWeightKg: 20,
          maxVolumeM3: 2,
        },
      });
      freeId = free.id;
      busyId = busy.id;
      foreignId = foreign.id;
      const courier = await admin.courier.create({
        data: { tenantId: tenantA, userId: userAdminOnlyA },
      });
      courierId = courier.id;
      const planning = await admin.routePlanningRequest.create({
        data: {
          tenantId: tenantA,
          requestedByUserId: userActiveA,
          parameters: {},
        },
      });
      planningId = planning.id;
      const route = await admin.route.create({
        data: {
          tenantId: tenantA,
          planningRequestId: planning.id,
          vehicleId: busyId,
          courierId,
          state: 'PLANNED',
        },
      });
      routeId = route.id;
      const makePackage = async (suffix: string, weightKg: number) => {
        const result = await post('/api/v1/packages', cookieA, {
          trackingCode: `EDIT-${suffix}-${run}`,
          address: { text: 'Calle 72 # 45-10', municipalityCode: '08001' },
          shipmentTypeId: shipmentTypeA,
          weightKg,
          lengthCm: 1,
          widthCm: 1,
          heightCm: 2,
        });
        expect(result.status).toBe(201);
        return result.body.id as string;
      };
      const assignedId = await makePackage('LOAD', 2);
      incomingId = await makePackage('INCOMING', 6);
      await admin.assignment.create({
        data: {
          tenantId: tenantA,
          packageId: assignedId,
          routeId,
          vehicleId: busyId,
          courierId,
          assignmentType: 'INITIAL',
        },
      });
    });
    afterAll(async () => {
      await admin.assignment.deleteMany({
        where: { tenantId: tenantA, routeId },
      });
      await admin.route.deleteMany({
        where: { tenantId: tenantA, id: routeId },
      });
      await admin.routePlanningRequest.deleteMany({
        where: { tenantId: tenantA, id: planningId },
      });
      await admin.courier.deleteMany({
        where: { tenantId: tenantA, id: courierId },
      });
      await admin.vehicle.deleteMany({
        where: { id: { in: [freeId, busyId, foreignId] } },
      });
    });
    it('rejects unauthenticated and unauthorized detail and mutations', async () => {
      await request(server).get(`/api/v1/vehicles/${freeId}`).expect(401);
      await request(server)
        .get(`/api/v1/vehicles/${freeId}`)
        .set('Cookie', cookieReceptionOnlyA)
        .expect(403);
      await request(server)
        .patch(`/api/v1/vehicles/${freeId}`)
        .send({ plate: 'EDIT099' })
        .expect(401);
      await patch(
        `/api/v1/vehicles/${freeId}`,
        { plate: 'EDIT099' },
        cookieReceptionOnlyA,
      ).expect(403);
      await patch(
        `/api/v1/vehicles/${freeId}/status`,
        { status: 'INACTIVE' },
        cookieReceptionOnlyA,
      ).expect(403);
    });
    it('hides another tenant vehicle for reads and writes', async () => {
      const missing = randomUUID();
      for (const target of [foreignId, missing]) {
        const read = await request(server)
          .get(`/api/v1/vehicles/${target}`)
          .set('Cookie', cookieA)
          .set('x-tenant-id', tenantB)
          .expect(404);
        expect(read.body.code).toBe('VEHICLE_NOT_FOUND');
        const edit = await patch(`/api/v1/vehicles/${target}`, {
          plate: 'EDIT099',
        }).expect(404);
        expect(edit.body.code).toBe('VEHICLE_NOT_FOUND');
        await patch(`/api/v1/vehicles/${target}/status`, {
          status: 'INACTIVE',
        }).expect(404);
      }
      expect(
        (await admin.vehicle.findUniqueOrThrow({ where: { id: foreignId } }))
          .plate,
      ).toBe('EDIT003');
    });
    it('reads exact operational detail', async () => {
      const read = await request(server)
        .get(`/api/v1/vehicles/${busyId}`)
        .set('Cookie', cookieA)
        .expect(200);
      expect(read.body).toMatchObject({
        isCommitted: true,
        assignedWeightKg: '2.000',
        remainingWeightKg: '8.000',
      });
    });
    it('updates a partial payload, preserves other fields and audits actor and correlation', async () => {
      const result = await patch(`/api/v1/vehicles/${freeId}`, {
        plate: ' edit-011 ',
        maxWeightKg: '12.001',
      }).expect(200);
      expect(result.body).toMatchObject({
        plate: 'EDIT011',
        maxWeightKg: '12.001',
        maxVolumeM3: '1.000' + '000',
      });
      const audit = await admin.auditLog.findFirstOrThrow({
        where: {
          tenantId: tenantA,
          entityId: freeId,
          action: 'VEHICLE_UPDATED',
        },
      });
      expect(audit.actorUserId).toBe(userActiveA);
      expect(audit.correlationId).toBeTruthy();
      expect(audit.metadata).toMatchObject({
        before: { plate: 'EDIT001' },
        after: { plate: 'EDIT011' },
      });
    });
    it('rejects duplicate plates and invalid updates without success auditing', async () => {
      const before = await admin.auditLog.count({
        where: { tenantId: tenantA, entityId: freeId },
      });
      const duplicate = await patch(`/api/v1/vehicles/${freeId}`, {
        plate: 'EDIT002',
      }).expect(409);
      expect(duplicate.body.code).toBe('VEHICLE_PLATE_CONFLICT');
      await patch(`/api/v1/vehicles/${freeId}`, {}).expect(400);
      await patch(`/api/v1/vehicles/${freeId}`, { maxWeightKg: 0 }).expect(400);
      await patch(`/api/v1/vehicles/${freeId}/status`, {
        status: 'BROKEN',
      }).expect(400);
      expect(
        await admin.auditLog.count({
          where: { tenantId: tenantA, entityId: freeId },
        }),
      ).toBe(before);
    });
    it('rejects reductions below load and inactivation of a committed vehicle', async () => {
      const weight = await patch(`/api/v1/vehicles/${busyId}`, {
        maxWeightKg: '1.999',
      }).expect(409);
      expect(weight.body).toMatchObject({
        code: 'VEHICLE_CAPACITY_BELOW_LOAD',
        field: 'maxWeightKg',
      });
      await patch(`/api/v1/vehicles/${busyId}`, {
        maxVolumeM3: '0.000001',
      }).expect(409);
      for (const status of ['INACTIVE', 'MAINTENANCE']) {
        const blocked = await patch(`/api/v1/vehicles/${busyId}/status`, {
          status,
        }).expect(409);
        expect(blocked.body.code).toBe('VEHICLE_COMMITTED');
      }
    });
    it('allows status changes of a free vehicle and audits them', async () => {
      for (const status of ['MAINTENANCE', 'INACTIVE', 'ACTIVE']) {
        await patch(`/api/v1/vehicles/${freeId}/status`, { status }).expect(
          200,
        );
        expect(
          (await admin.vehicle.findUniqueOrThrow({ where: { id: freeId } }))
            .status,
        ).toBe(status);
      }
      expect(
        await admin.auditLog.count({
          where: {
            tenantId: tenantA,
            entityId: freeId,
            action: 'VEHICLE_STATUS_UPDATED',
          },
        }),
      ).toBe(3);
    });
    it('rolls back the edit if its audit cannot be persisted', async () => {
      const service = app.get(ManageVehicleService);
      await expect(
        service.update(
          {
            tenantId: tenantA,
            actorUserId: randomUUID(),
            correlationId: randomUUID(),
          },
          freeId,
          { plate: 'EDIT090' },
        ),
      ).rejects.toThrow();
      expect(
        (await admin.vehicle.findUniqueOrThrow({ where: { id: freeId } }))
          .plate,
      ).toBe('EDIT011');
    });
    it('never overloads when reservation races a capacity reduction', async () => {
      const reservation = new PrismaAssignmentReservation(
        app.get(PrismaService),
      );
      const [edit, reserved] = await Promise.all([
        patch(`/api/v1/vehicles/${busyId}`, { maxWeightKg: '5' }),
        reservation.reserve({
          tenantId: tenantA,
          routeId,
          packageId: incomingId,
          responsibleUserId: userActiveA,
        }),
      ]);
      expect([200, 409]).toContain(edit.status);
      expect(['ASSIGNED', 'PENDING_ASSIGNMENT']).toContain(reserved.kind);
      const detail = await request(server)
        .get(`/api/v1/vehicles/${busyId}`)
        .set('Cookie', cookieA)
        .expect(200);
      expect(Number(detail.body.assignedWeightKg)).toBeLessThanOrEqual(
        Number(detail.body.maxWeightKg),
      );
      if (edit.status === 200) expect(reserved.kind).toBe('PENDING_ASSIGNMENT');
      if (reserved.kind === 'ASSIGNED') expect(edit.status).toBe(409);
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

  describe('Courier administration', () => {
    let freeId: string;
    let busyId: string;
    let foreignId: string;
    let vehicleId: string;
    let planningId: string;
    let routeId: string;
    const patch = (id: string, body: object, cookie = cookieA) =>
      request(server)
        .patch(`/api/v1/couriers/${id}/status`)
        .set('Cookie', cookie)
        .send(body);
    beforeAll(async () => {
      const free = await post('/api/v1/couriers', cookieA, {
        userId: userReceptionOnlyA,
      });
      expect(free.status).toBe(201);
      freeId = free.body.id as string;
      busyId = (
        await admin.courier.findFirstOrThrow({
          where: { tenantId: tenantA, userId: userActiveA },
        })
      ).id;
      foreignId = (
        await admin.courier.findFirstOrThrow({
          where: { tenantId: tenantB, userId: userActiveB },
        })
      ).id;
      vehicleId = (
        await admin.vehicle.create({
          data: {
            tenantId: tenantA,
            plate: 'COURIER01',
            maxWeightKg: 10,
            maxVolumeM3: 1,
          },
        })
      ).id;
      planningId = (
        await admin.routePlanningRequest.create({
          data: {
            tenantId: tenantA,
            requestedByUserId: userActiveA,
            parameters: {},
          },
        })
      ).id;
      routeId = (
        await admin.route.create({
          data: {
            tenantId: tenantA,
            vehicleId,
            courierId: busyId,
            planningRequestId: planningId,
            state: 'PLANNED',
          },
        })
      ).id;
    });
    afterAll(async () => {
      await admin.route.deleteMany({
        where: { id: routeId, tenantId: tenantA },
      });
      await admin.routePlanningRequest.deleteMany({
        where: { id: planningId, tenantId: tenantA },
      });
      await admin.vehicle.deleteMany({
        where: { id: vehicleId, tenantId: tenantA },
      });
    });
    it('lists and paginates only tenant couriers with a safe user projection', async () => {
      const response = await request(server)
        .get('/api/v1/couriers?page=1&pageSize=1')
        .set('Cookie', cookieA);
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ total: 2, page: 1, pageSize: 1 });
      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0]).toMatchObject({
        tenantId: tenantA,
        email: expect.any(String),
      });
      expect(JSON.stringify(response.body)).not.toMatch(
        /passwordHash|sessions|userRoles/,
      );
      const empty = await request(server)
        .get('/api/v1/couriers?page=3&pageSize=1')
        .set('Cookie', cookieA);
      expect(empty.body).toMatchObject({ items: [], total: 2 });
    });
    it('returns searchable active and unlinked candidates without needing MANAGE_EMPLOYEES', async () => {
      const response = await request(server)
        .get('/api/v1/couriers/eligible-users?page=1&pageSize=20')
        .set('Cookie', cookieAdminOnlyA);
      expect(response.status).toBe(200);
      expect(
        response.body.items.map((user: { id: string }) => user.id),
      ).toEqual([userAdminOnlyA]);
      expect(Object.keys(response.body.items[0]).sort()).toEqual([
        'email',
        'id',
        'status',
      ]);
      const empty = await request(server)
        .get('/api/v1/couriers/eligible-users?search=nonexistent')
        .set('Cookie', cookieA);
      expect(empty.body).toMatchObject({ items: [], total: 0 });
    });
    it('exposes commitment in detail and searches by email', async () => {
      const response = await request(server)
        .get(`/api/v1/couriers/${busyId}`)
        .set('Cookie', cookieA);
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        isCommitted: true,
        activeRouteIds: [routeId],
        activeAssignmentCount: 0,
      });
      const search = await request(server)
        .get('/api/v1/couriers')
        .query({ search: response.body.email, status: 'ACTIVE' })
        .set('Cookie', cookieA);
      expect(
        search.body.items.map((courier: { id: string }) => courier.id),
      ).toEqual([busyId]);
    });
    it('returns identical neutral 404 responses for foreign and missing ids on reads and updates', async () => {
      const missing = randomUUID();
      const foreignRead = await request(server)
        .get(`/api/v1/couriers/${foreignId}`)
        .set('Cookie', cookieA);
      const missingRead = await request(server)
        .get(`/api/v1/couriers/${missing}`)
        .set('Cookie', cookieA);
      expect(foreignRead.status).toBe(404);
      expect(foreignRead.body).toEqual(missingRead.body);
      const foreignWrite = await patch(foreignId, { status: 'INACTIVE' });
      const missingWrite = await patch(missing, { status: 'INACTIVE' });
      expect(foreignWrite.status).toBe(404);
      expect(foreignWrite.body).toEqual(missingWrite.body);
      expect(
        (await admin.courier.findUniqueOrThrow({ where: { id: foreignId } }))
          .status,
      ).toBe('ACTIVE');
    });
    it.each(['/api/v1/couriers', '/api/v1/couriers/eligible-users'])(
      'protects %s against anonymous and unauthorized reads',
      async (path) => {
        expect((await request(server).get(path)).status).toBe(401);
        expect(
          (await request(server).get(path).set('Cookie', cookieReceptionOnlyA))
            .status,
        ).toBe(403);
      },
    );
    it('protects details and updates with MANAGE_TENANT', async () => {
      expect(
        (
          await request(server)
            .get(`/api/v1/couriers/${freeId}`)
            .set('Cookie', cookieReceptionOnlyA)
        ).status,
      ).toBe(403);
      expect(
        (await patch(freeId, { status: 'INACTIVE' }, cookieReceptionOnlyA))
          .status,
      ).toBe(403);
      expect(
        (
          await request(server)
            .patch(`/api/v1/couriers/${freeId}/status`)
            .send({ status: 'INACTIVE' })
        ).status,
      ).toBe(401);
    });
    it('rejects invalid filters, ids, status and attempts to change ownership', async () => {
      for (const query of [
        'page=0',
        'pageSize=101',
        'status=MAINTENANCE',
        'search=' + 'x'.repeat(101),
      ]) {
        const response = await request(server)
          .get(`/api/v1/couriers?${query}`)
          .set('Cookie', cookieA);
        expect(response.status).toBe(400);
        expect(response.body.code).toBe('VALIDATION_ERROR');
      }
      expect((await patch('invalid', { status: 'INACTIVE' })).status).toBe(400);
      expect((await patch(freeId, { status: 'MAINTENANCE' })).status).toBe(400);
      expect(
        (await patch(freeId, { status: 'INACTIVE', tenantId: tenantB })).status,
      ).toBe(400);
    });
    it('rejects inactivation with an unclosed route without writing an audit', async () => {
      const before = await admin.auditLog.count({
        where: { tenantId: tenantA, entityId: busyId },
      });
      const response = await patch(busyId, { status: 'INACTIVE' });
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('COURIER_COMMITTED');
      expect(
        (await admin.courier.findUniqueOrThrow({ where: { id: busyId } }))
          .status,
      ).toBe('ACTIVE');
      expect(
        await admin.auditLog.count({
          where: { tenantId: tenantA, entityId: busyId },
        }),
      ).toBe(before);
    });
    it('updates a free courier atomically with minimal old/new audit and no duplicate audit on no-op', async () => {
      const response = await patch(freeId, { status: 'INACTIVE' });
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('INACTIVE');
      const audit = await admin.auditLog.findFirstOrThrow({
        where: {
          tenantId: tenantA,
          entityId: freeId,
          action: 'COURIER_STATUS_UPDATED',
        },
      });
      expect(audit.actorUserId).toBe(userActiveA);
      expect(audit.metadata).toEqual({
        before: { userId: userReceptionOnlyA, status: 'ACTIVE' },
        after: { userId: userReceptionOnlyA, status: 'INACTIVE' },
      });
      expect((await patch(freeId, { status: 'INACTIVE' })).status).toBe(200);
      expect(
        await admin.auditLog.count({
          where: {
            tenantId: tenantA,
            entityId: freeId,
            action: 'COURIER_STATUS_UPDATED',
          },
        }),
      ).toBe(1);
    });
    it('requires an active account for reactivation and does not change user status', async () => {
      await admin.user.update({
        where: { id: userReceptionOnlyA },
        data: { status: 'SUSPENDED' },
      });
      const denied = await patch(freeId, { status: 'ACTIVE' });
      expect(denied.status).toBe(409);
      expect(denied.body.code).toBe('COURIER_USER_NOT_ELIGIBLE');
      expect(
        (
          await admin.user.findUniqueOrThrow({
            where: { id: userReceptionOnlyA },
          })
        ).status,
      ).toBe('SUSPENDED');
      await admin.user.update({
        where: { id: userReceptionOnlyA },
        data: { status: 'ACTIVE' },
      });
      expect((await patch(freeId, { status: 'ACTIVE' })).status).toBe(200);
    });
    it('rolls back status if the audit actor violates the tenant FK', async () => {
      const before = await admin.auditLog.count({
        where: { tenantId: tenantA, entityId: freeId },
      });
      await expect(
        app.get(ManageCourierService).changeStatus(
          {
            tenantId: tenantA,
            actorUserId: userActiveB,
            correlationId: randomUUID(),
          },
          freeId,
          { status: 'INACTIVE' },
        ),
      ).rejects.toThrow();
      expect(
        (await admin.courier.findUniqueOrThrow({ where: { id: freeId } }))
          .status,
      ).toBe('ACTIVE');
      expect(
        await admin.auditLog.count({
          where: { tenantId: tenantA, entityId: freeId },
        }),
      ).toBe(before);
    });
    it('rolls back registration if its audit cannot be persisted', async () => {
      await expect(
        app
          .get(RegisterCourierService)
          .execute(
            {
              tenantId: tenantA,
              actorUserId: userActiveB,
              correlationId: randomUUID(),
            },
            { userId: userAdminOnlyA },
          ),
      ).rejects.toThrow();
      expect(
        await admin.courier.count({
          where: { tenantId: tenantA, userId: userAdminOnlyA },
        }),
      ).toBe(0);
    });
    it('audits registration and prevents duplicate concurrent links', async () => {
      const [a, b] = await Promise.all([
        post('/api/v1/couriers', cookieA, { userId: userAdminOnlyA }),
        post('/api/v1/couriers', cookieA, { userId: userAdminOnlyA }),
      ]);
      expect([a.status, b.status].sort()).toEqual([201, 409]);
      const courier = await admin.courier.findFirstOrThrow({
        where: { tenantId: tenantA, userId: userAdminOnlyA },
      });
      expect(
        await admin.auditLog.count({
          where: {
            tenantId: tenantA,
            entityId: courier.id,
            action: 'COURIER_REGISTERED',
          },
        }),
      ).toBe(1);
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
