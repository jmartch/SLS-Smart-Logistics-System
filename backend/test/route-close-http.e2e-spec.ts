import { randomUUID } from 'node:crypto';
import { INestApplication, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { AppModule } from '../src/app.module';
import {
  seedRouteCloseEnvironment,
  cleanRouteCloseEnvironment,
  createAllDeliveredRegularRoute,
  createSevenPackagesForcedRoute,
  type RouteCloseEnvironment,
} from './fixtures/route-close-lifecycle.fixtures';

describe('Route Closure HTTP API E2E (/api/v1/routes/:id/close & summary)', () => {
  let app: INestApplication<App>;
  let server: any;

  const admin = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  let env: RouteCloseEnvironment;

  beforeAll(async () => {
    for (const variable of ['DATABASE_URL', 'RUNTIME_DATABASE_URL'] as const) {
      const connectionString = process.env[variable];
      if (!connectionString) {
        throw new Error(`${variable} is required`);
      }
      const databasePath = new URL(connectionString).pathname;
      if (!/^\/sls_routeclose01_[0-9a-f]{32}$/.test(databasePath)) {
        throw new Error(
          `${variable} must point to a disposable sls_routeclose01_* database`,
        );
      }
    }

    await admin.$connect();
    env = await seedRouteCloseEnvironment(admin);

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
    if (env) {
      await cleanRouteCloseEnvironment(admin, [env.tenantAId, env.tenantBId]);
    }
    await admin.$disconnect();
    if (app) {
      await app.close();
    }
  });

  describe('POST /api/v1/routes/:id/close', () => {
    it('rejects unauthenticated requests missing x-tenant-id (CA-01)', async () => {
      const response = await request(server)
        .post(`/api/v1/routes/${randomUUID()}/close`)
        .send({ mode: 'REGULAR' });

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        code: 'UNAUTHENTICATED',
      });
    });

    it('rejects request when id is not a valid UUID (CA-10)', async () => {
      const response = await request(server)
        .post('/api/v1/routes/not-a-uuid/close')
        .set('x-tenant-id', env.tenantAId)
        .set('x-user-id', env.userCoordAId)
        .set('idempotency-key', randomUUID())
        .send({ mode: 'REGULAR' });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        code: 'VALIDATION_ERROR',
      });
    });

    it('rejects request when Idempotency-Key header is missing (CA-10)', async () => {
      const response = await request(server)
        .post(`/api/v1/routes/${randomUUID()}/close`)
        .set('x-tenant-id', env.tenantAId)
        .set('x-user-id', env.userCoordAId)
        .send({ mode: 'REGULAR' });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        code: 'VALIDATION_ERROR',
      });
      expect(response.body.message).toContain('Idempotency-Key');
    });

    it('rejects request when mode is FORCED without reasonCode or notes (CA-10)', async () => {
      const response = await request(server)
        .post(`/api/v1/routes/${randomUUID()}/close`)
        .set('x-tenant-id', env.tenantAId)
        .set('x-user-id', env.userCoordAId)
        .set('idempotency-key', randomUUID())
        .send({ mode: 'FORCED' });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        code: 'VALIDATION_ERROR',
      });
    });

    it('rejects forbidden actors such as couriers (CA-01)', async () => {
      const fixture = await createAllDeliveredRegularRoute(admin, env);

      const response = await request(server)
        .post(`/api/v1/routes/${fixture.routeId}/close`)
        .set('x-tenant-id', env.tenantAId)
        .set('x-user-id', env.courierUser1Id) // Courier role
        .set('idempotency-key', randomUUID())
        .send({ mode: 'REGULAR' });

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('returns 404 when route belongs to another tenant (CA-01, CA-12)', async () => {
      const fixture = await createAllDeliveredRegularRoute(admin, env);

      const response = await request(server)
        .post(`/api/v1/routes/${fixture.routeId}/close`)
        .set('x-tenant-id', env.tenantBId)
        .set('x-user-id', env.userCoordBId)
        .set('idempotency-key', randomUUID())
        .send({ mode: 'REGULAR' });

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        code: 'ROUTE_NOT_FOUND',
      });
    });

    it('returns 409 Conflict when REGULAR mode has unvisited or unresolved stops (CA-03)', async () => {
      const fixture = await createSevenPackagesForcedRoute(admin, env);

      const response = await request(server)
        .post(`/api/v1/routes/${fixture.routeId}/close`)
        .set('x-tenant-id', env.tenantAId)
        .set('x-user-id', env.userCoordAId)
        .set('idempotency-key', randomUUID())
        .send({ mode: 'REGULAR' });

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        code: 'ROUTE_CUSTODY_UNRESOLVED',
      });
    });

    it('successfully closes route in REGULAR mode with 200 OK and supports replay (CA-02, CA-09, CA-10)', async () => {
      const fixture = await createAllDeliveredRegularRoute(admin, env);
      const idempotencyKey = randomUUID();

      // First call
      const response1 = await request(server)
        .post(`/api/v1/routes/${fixture.routeId}/close`)
        .set('x-tenant-id', env.tenantAId)
        .set('x-user-id', env.userCoordAId)
        .set('idempotency-key', idempotencyKey)
        .send({
          mode: 'REGULAR',
          actualDistanceM: 5240,
        });

      if (response1.status !== 200) {
        console.error('response1 error payload:', response1.status, response1.body);
      }

      expect(response1.status).toBe(200);
      expect(response1.body).toMatchObject({
        routeId: fixture.routeId,
        state: 'COMPLETED',
        replayed: false,
      });
      expect(response1.body.summary).toMatchObject({
        totalAssigned: 3,
        deliveredCount: 3,
        failedCount: 0,
      });

      // Second call: exact replay
      const response2 = await request(server)
        .post(`/api/v1/routes/${fixture.routeId}/close`)
        .set('x-tenant-id', env.tenantAId)
        .set('x-user-id', env.userCoordAId)
        .set('idempotency-key', idempotencyKey)
        .send({
          mode: 'REGULAR',
          actualDistanceM: 5240,
        });

      expect(response2.status).toBe(200);
      expect(response2.body).toMatchObject({
        routeId: fixture.routeId,
        state: 'COMPLETED',
        replayed: true,
      });

      // Third call: reused key with altered payload -> 409 Conflict
      const response3 = await request(server)
        .post(`/api/v1/routes/${fixture.routeId}/close`)
        .set('x-tenant-id', env.tenantAId)
        .set('x-user-id', env.userCoordAId)
        .set('idempotency-key', idempotencyKey)
        .send({
          mode: 'FORCED',
          reasonCode: 'TAMPERED',
          notes: 'Tampered notes',
        });

      expect(response3.status).toBe(409);
      expect(response3.body).toMatchObject({
        code: 'IDEMPOTENCY_KEY_REUSED',
      });
    });
  });

  describe('GET /api/v1/routes/:id/summary', () => {
    it('returns 401 UNAUTHENTICATED if x-tenant-id is missing (CA-01)', async () => {
      const response = await request(server).get(
        `/api/v1/routes/${randomUUID()}/summary`,
      );

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        code: 'UNAUTHENTICATED',
      });
    });

    it('returns 404 NOT_FOUND if route belongs to another tenant (CA-01, CA-12)', async () => {
      const fixture = await createAllDeliveredRegularRoute(admin, env);

      const response = await request(server)
        .get(`/api/v1/routes/${fixture.routeId}/summary`)
        .set('x-tenant-id', env.tenantBId)
        .set('x-user-id', env.userCoordBId);

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        code: 'ROUTE_NOT_FOUND',
      });
    });

    it('returns 409 Conflict if route is not COMPLETED (CA-05)', async () => {
      const fixture = await createAllDeliveredRegularRoute(admin, env);

      const response = await request(server)
        .get(`/api/v1/routes/${fixture.routeId}/summary`)
        .set('x-tenant-id', env.tenantAId)
        .set('x-user-id', env.userCoordAId);

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        code: 'ROUTE_NOT_COMPLETED',
      });
    });

    it('returns full summary to coordinator and projected summary to courier (CA-01, CA-05, CA-10)', async () => {
      const fixture = await createAllDeliveredRegularRoute(admin, env);

      // Close route with notes
      await request(server)
        .post(`/api/v1/routes/${fixture.routeId}/close`)
        .set('x-tenant-id', env.tenantAId)
        .set('x-user-id', env.userCoordAId)
        .set('idempotency-key', randomUUID())
        .send({
          mode: 'REGULAR',
          notes: 'Supervisor operational audit note',
        });

      // Coordinator request
      const coordRes = await request(server)
        .get(`/api/v1/routes/${fixture.routeId}/summary`)
        .set('x-tenant-id', env.tenantAId)
        .set('x-user-id', env.userCoordAId);

      expect(coordRes.status).toBe(200);
      expect(coordRes.body).toMatchObject({
        totalAssigned: 3,
        deliveredCount: 3,
        notes: 'Supervisor operational audit note',
      });

      // Assigned Courier request
      const courierRes = await request(server)
        .get(`/api/v1/routes/${fixture.routeId}/summary`)
        .set('x-tenant-id', env.tenantAId)
        .set('x-user-id', env.courierUser1Id);

      expect(courierRes.status).toBe(200);
      expect(courierRes.body).toMatchObject({
        totalAssigned: 3,
        deliveredCount: 3,
      });
      // Notes must be redacted
      expect(courierRes.body).not.toHaveProperty('notes');
    });
  });
});
