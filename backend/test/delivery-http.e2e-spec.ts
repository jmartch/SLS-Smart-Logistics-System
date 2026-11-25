import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  VersioningType,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { AppModule } from '../src/app.module';
import { AuthGuard } from '../src/modules/auth/presentation/auth.guard';
import type { RequestWithActor } from '../src/shared/presentation/request-context.decorator';
import {
  cleanDeliveryLifecycleEnvironment,
  createDeliveryRouteWithMultiPackageStops,
  seedDeliveryLifecycleEnvironment,
  type DeliveryLifecycleEnvironment,
  type DeliveryRouteFixture,
} from './fixtures/delivery-lifecycle.fixtures';

interface HttpTestRequest extends RequestWithActor {
  headers: Record<string, string | undefined>;
}

describe('Deliveries HTTP API E2E (/api/v1/deliveries)', () => {
  let app: INestApplication<Server>;
  let server: Server;
  let storageDir: string;

  const admin = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  let env: DeliveryLifecycleEnvironment;
  let routeFixture: DeliveryRouteFixture;
  let failedAttempt1Id: string;
  let failedAttempt4Id: string;

  beforeAll(async () => {
    for (const variable of ['DATABASE_URL', 'RUNTIME_DATABASE_URL'] as const) {
      const connectionString = process.env[variable];
      if (!connectionString) {
        throw new Error(`${variable} is required`);
      }
      const databasePath = new URL(connectionString).pathname;
      if (!/^\/sls_delivery01_[0-9a-f]{32}$/.test(databasePath)) {
        throw new Error(
          `${variable} must point to a disposable sls_delivery01_* database`,
        );
      }
    }

    storageDir = fs.mkdtempSync(pathJoin(os.tmpdir(), 'sls-delivery-http-'));
    process.env.EVIDENCE_STORAGE_ROOT = storageDir;

    await admin.$connect();
    env = await seedDeliveryLifecycleEnvironment(admin);
    routeFixture = await createDeliveryRouteWithMultiPackageStops(admin, env);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext): boolean => {
          const req = context.switchToHttp().getRequest<HttpTestRequest>();
          const tenantId = req.headers['x-tenant-id'];
          const userId = req.headers['x-user-id'];
          if (!tenantId) {
            throw new UnauthorizedException({
              code: 'UNAUTHENTICATED',
              message: 'Missing x-tenant-id header',
            });
          }
          const permissions = new Set<string>();
          if (userId === env.userCoordAId) {
            permissions.add('COORDINATE_ROUTES');
            permissions.add('OPERATE_DELIVERIES');
            permissions.add('REGISTER_PACKAGES');
          } else if (
            userId === env.courierUser1Id ||
            userId === env.courierUser2Id ||
            userId === env.courierUserBId
          ) {
            permissions.add('OPERATE_DELIVERIES');
          }
          req.actor = {
            kind: 'TENANT_USER',
            tenantId,
            userId: userId ?? 'anonymous',
            permissions,
          };
          return true;
        },
      })
      .compile();

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
      if (env) {
        await cleanDeliveryLifecycleEnvironment(admin, [
          env.tenantAId,
          env.tenantBId,
        ]);
      }
    } finally {
      if (app) {
        await app.close();
      }
      await admin.$disconnect();
      if (storageDir && fs.existsSync(storageDir)) {
        fs.rmSync(storageDir, { recursive: true, force: true });
      }
    }
  });

  function pathJoin(...parts: string[]): string {
    return parts.join('/');
  }

  describe('POST /api/v1/deliveries/routes/:routeId/stops/:stopId/attend', () => {
    it('records courier arrival at Stop 2 with 200 OK', async () => {
      const requestId = `http-attend-${randomUUID()}`;

      const res = await request(server)
        .post(
          `/api/v1/deliveries/routes/${routeFixture.routeId}/stops/${routeFixture.stop2Id}/attend`,
        )
        .set('x-tenant-id', env.tenantAId)
        .set('x-user-id', env.courierUser1Id)
        .set('idempotency-key', requestId)
        .expect(200);

      expect(res.body.stopId).toBe(routeFixture.stop2Id);
      expect(res.body.affectedPackageIds).toContain(routeFixture.pkg2Id);
      expect(res.body.replayed).toBe(false);
    });

    it('returns 404 when route does not belong to the calling tenant', async () => {
      await request(server)
        .post(
          `/api/v1/deliveries/routes/${routeFixture.routeId}/stops/${routeFixture.stop2Id}/attend`,
        )
        .set('x-tenant-id', env.tenantBId)
        .set('x-user-id', env.courierUserBId)
        .set('idempotency-key', `http-attend-${randomUUID()}`)
        .expect(404);
    });
  });

  describe('POST /api/v1/deliveries/routes/:routeId/stops/:stopId/packages/:packageId/successful-attempts', () => {
    it('records successful delivery with multipart photo upload and returns 201 Created', async () => {
      const requestId = `http-success-${randomUUID()}`;

      const res = await request(server)
        .post(
          `/api/v1/deliveries/routes/${routeFixture.routeId}/stops/${routeFixture.stop2Id}/packages/${routeFixture.pkg2Id}/successful-attempts`,
        )
        .set('x-tenant-id', env.tenantAId)
        .set('x-user-id', env.courierUser1Id)
        .set('idempotency-key', requestId)
        .field('notes', 'Left with receptionist')
        .attach('photo', Buffer.from('fake-photo-bytes'), 'evidence.jpg')
        .expect(201);

      expect(res.body.outcome).toBe('DELIVERED');
      expect(res.body.packageId).toBe(routeFixture.pkg2Id);
      expect(res.body.evidenceIds).toHaveLength(1);
      expect(res.body.stopResolution).toBe('PENDING');
      expect(res.body.replayed).toBe(false);
    });

    it('replays response idempotently with 201 and replayed: true on repeated request', async () => {
      const requestId = `http-success-replay-${randomUUID()}`;

      // First call
      const firstRes = await request(server)
        .post(
          `/api/v1/deliveries/routes/${routeFixture.routeId}/stops/${routeFixture.stop2Id}/packages/${routeFixture.pkg3Id}/successful-attempts`,
        )
        .set('x-tenant-id', env.tenantAId)
        .set('x-user-id', env.courierUser1Id)
        .set('idempotency-key', requestId)
        .attach('photo', Buffer.from('fake-photo-3'), 'photo3.jpg')
        .expect(201);

      // Replay call
      const secondRes = await request(server)
        .post(
          `/api/v1/deliveries/routes/${routeFixture.routeId}/stops/${routeFixture.stop2Id}/packages/${routeFixture.pkg3Id}/successful-attempts`,
        )
        .set('x-tenant-id', env.tenantAId)
        .set('x-user-id', env.courierUser1Id)
        .set('idempotency-key', requestId)
        .attach('photo', Buffer.from('fake-photo-3'), 'photo3.jpg')
        .expect(201);

      expect(firstRes.body.replayed).toBe(false);
      expect(secondRes.body.replayed).toBe(true);
      expect(secondRes.body.attemptId).toBe(firstRes.body.attemptId);
    });

    it('returns 409 Conflict when reusing Idempotency-Key for a different target package', async () => {
      const reusedKey = `http-idempotency-conflict-${randomUUID()}`;

      // Attend Stop 1 first so pkg1 transitions to OUT_FOR_DELIVERY
      await request(server)
        .post(
          `/api/v1/deliveries/routes/${routeFixture.routeId}/stops/${routeFixture.stop1Id}/attend`,
        )
        .set('x-tenant-id', env.tenantAId)
        .set('x-user-id', env.courierUser1Id)
        .set('idempotency-key', `http-attend-stop1-${randomUUID()}`)
        .expect(200);

      // First call for pkg1 (failed attempt)
      const firstFailRes = await request(server)
        .post(
          `/api/v1/deliveries/routes/${routeFixture.routeId}/stops/${routeFixture.stop1Id}/packages/${routeFixture.pkg1Id}/failed-attempts`,
        )
        .set('x-tenant-id', env.tenantAId)
        .set('x-user-id', env.courierUser1Id)
        .set('idempotency-key', reusedKey)
        .send({ reasonCode: 'RECIPIENT_ABSENT' })
        .expect(201);

      failedAttempt1Id = firstFailRes.body.attemptId;

      // Reused key targeting different stop/package
      await request(server)
        .post(
          `/api/v1/deliveries/routes/${routeFixture.routeId}/stops/${routeFixture.stop3Id}/packages/${routeFixture.pkg4Id}/failed-attempts`,
        )
        .set('x-tenant-id', env.tenantAId)
        .set('x-user-id', env.courierUser1Id)
        .set('idempotency-key', reusedKey)
        .send({ reasonCode: 'RECIPIENT_ABSENT' })
        .expect(409);
    });
  });

  describe('POST /api/v1/deliveries/routes/:routeId/stops/:stopId/packages/:packageId/failed-attempts', () => {
    it('records failed attempt with 201 Created and reasonCode', async () => {
      // Attend Stop 3 first so pkg4 transitions to OUT_FOR_DELIVERY
      await request(server)
        .post(
          `/api/v1/deliveries/routes/${routeFixture.routeId}/stops/${routeFixture.stop3Id}/attend`,
        )
        .set('x-tenant-id', env.tenantAId)
        .set('x-user-id', env.courierUser1Id)
        .set('idempotency-key', `http-attend-stop3-${randomUUID()}`)
        .expect(200);

      const requestId = `http-fail-${randomUUID()}`;

      const res = await request(server)
        .post(
          `/api/v1/deliveries/routes/${routeFixture.routeId}/stops/${routeFixture.stop3Id}/packages/${routeFixture.pkg4Id}/failed-attempts`,
        )
        .set('x-tenant-id', env.tenantAId)
        .set('x-user-id', env.courierUser1Id)
        .set('idempotency-key', requestId)
        .send({
          reasonCode: 'ADDRESS_NOT_FOUND',
          notes: 'No building at number',
        })
        .expect(201);

      expect(res.body.outcome).toBe('FAILED');
      expect(res.body.reasonCode).toBe('ADDRESS_NOT_FOUND');
      expect(res.body.replayed).toBe(false);
      failedAttempt4Id = res.body.attemptId;
    });

    it('rejects missing reasonCode with 400 Bad Request', async () => {
      await request(server)
        .post(
          `/api/v1/deliveries/routes/${routeFixture.routeId}/stops/${routeFixture.stop3Id}/packages/${routeFixture.pkg4Id}/failed-attempts`,
        )
        .set('x-tenant-id', env.tenantAId)
        .set('x-user-id', env.courierUser1Id)
        .set('idempotency-key', `http-fail-bad-${randomUUID()}`)
        .send({})
        .expect(400);
    });
  });

  describe('POST /api/v1/deliveries/packages/:packageId/reschedules', () => {
    it('reschedules failed package with 201 Created and delivery window', async () => {
      const requestId = `http-resched-${randomUUID()}`;

      const res = await request(server)
        .post(`/api/v1/deliveries/packages/${routeFixture.pkg1Id}/reschedules`)
        .set('x-tenant-id', env.tenantAId)
        .set('x-user-id', env.userCoordAId)
        .set('idempotency-key', requestId)
        .send({
          failedAttemptId: failedAttempt1Id,
          startAt: '2026-10-07T09:00:00.000Z',
          endAt: '2026-10-07T13:00:00.000Z',
          reasonCode: 'CUSTOMER_REQUESTED_RESCHEDULE',
        })
        .expect(201);

      expect(res.body.newStatus).toBe('RESCHEDULED');
      expect(res.body.windowId).toBeDefined();
    });

    it('rejects invalid date format with 400 Bad Request', async () => {
      await request(server)
        .post(`/api/v1/deliveries/packages/${routeFixture.pkg1Id}/reschedules`)
        .set('x-tenant-id', env.tenantAId)
        .set('x-user-id', env.userCoordAId)
        .set('idempotency-key', `http-resched-bad-${randomUUID()}`)
        .send({
          failedAttemptId: failedAttempt1Id,
          startAt: 'invalid-date',
          endAt: 'invalid-date',
          reasonCode: 'CUSTOMER_REQUESTED_RESCHEDULE',
        })
        .expect(400);
    });
  });

  describe('POST /api/v1/deliveries/packages/:packageId/return-requests', () => {
    it('requests return for pkg4 with 201 Created', async () => {
      const requestId = `http-return-req-${randomUUID()}`;

      const res = await request(server)
        .post(`/api/v1/deliveries/packages/${routeFixture.pkg4Id}/return-requests`)
        .set('x-tenant-id', env.tenantAId)
        .set('x-user-id', env.userCoordAId)
        .set('idempotency-key', requestId)
        .send({
          failedAttemptId: failedAttempt4Id,
          reasonCode: 'EXCEEDED_ATTEMPTS',
        })
        .expect(201);

      expect(res.body.newStatus).toBe('RETURN_PENDING');
    });
  });

  describe('POST /api/v1/deliveries/packages/:packageId/depot-receptions', () => {
    it('receives returned package pkg4 at depot with 201 Created', async () => {
      const requestId = `http-depot-rcpt-${randomUUID()}`;

      const res = await request(server)
        .post(`/api/v1/deliveries/packages/${routeFixture.pkg4Id}/depot-receptions`)
        .set('x-tenant-id', env.tenantAId)
        .set('x-user-id', env.userCoordAId)
        .set('idempotency-key', requestId)
        .send({
          routeId: routeFixture.routeId,
          depotId: env.depotAId,
          physicalReceiptConfirmed: true,
        })
        .expect(201);

      expect(res.body.status).toBe('RETURNED');
    });
  });

  describe('POST /api/v1/deliveries/incidents', () => {
    it('reports an incident for a route with 201 Created', async () => {
      const requestId = `http-incident-${randomUUID()}`;

      const res = await request(server)
        .post('/api/v1/deliveries/incidents')
        .set('x-tenant-id', env.tenantAId)
        .set('x-user-id', env.courierUser1Id)
        .set('idempotency-key', requestId)
        .send({
          routeId: routeFixture.routeId,
          type: 'TRAFFIC_JAM',
          description: 'Blocked road on Calle 80',
        })
        .expect(201);

      expect(res.body.incidentId).toBeDefined();
      expect(res.body.type).toBe('TRAFFIC_JAM');
    });

    it('rejects request without any target with 400 Bad Request', async () => {
      await request(server)
        .post('/api/v1/deliveries/incidents')
        .set('x-tenant-id', env.tenantAId)
        .set('x-user-id', env.courierUser1Id)
        .set('idempotency-key', `http-incident-bad-${randomUUID()}`)
        .send({
          type: 'TRAFFIC_JAM',
          description: 'Nowhere',
        })
        .expect(400);
    });
  });

  describe('GET /api/v1/deliveries/routes/:routeId/manifest', () => {
    it('returns delivery manifest with stops for authorized courier (200 OK)', async () => {
      const res = await request(server)
        .get(`/api/v1/deliveries/routes/${routeFixture.routeId}/manifest?view=all`)
        .set('x-tenant-id', env.tenantAId)
        .set('x-user-id', env.courierUser1Id)
        .expect(200);

      expect(res.body.routeId).toBe(routeFixture.routeId);
      expect(res.body.view).toBe('all');
      expect(res.body.stops).toHaveLength(3);
    });

    it('denies user from another tenant with 404/403', async () => {
      await request(server)
        .get(`/api/v1/deliveries/routes/${routeFixture.routeId}/manifest`)
        .set('x-tenant-id', env.tenantBId)
        .set('x-user-id', env.courierUserBId)
        .expect(404);
    });
  });
});
