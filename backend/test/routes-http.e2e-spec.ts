import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
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
  cleanRouteLifecycleEnvironment,
  createRouteWithStopsAndPackages,
  seedRouteLifecycleEnvironment,
  type RouteLifecycleEnvironment,
} from './fixtures/route-lifecycle.fixtures';

interface HttpTestRequest extends RequestWithActor {
  headers: Record<string, string | undefined>;
}

describe('Routes HTTP API E2E (/api/v1/routes)', () => {
  let app: INestApplication<Server>;
  let server: Server;

  const admin = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  let env: RouteLifecycleEnvironment;

  beforeAll(async () => {
    for (const variable of ['DATABASE_URL', 'RUNTIME_DATABASE_URL'] as const) {
      const connectionString = process.env[variable];
      if (!connectionString) {
        throw new Error(`${variable} is required`);
      }
      const databasePath = new URL(connectionString).pathname;
      if (!/^\/sls_route01_[0-9a-f]{32}$/.test(databasePath)) {
        throw new Error(
          `${variable} must point to a disposable sls_route01_* database`,
        );
      }
    }

    await admin.$connect();
    env = await seedRouteLifecycleEnvironment(admin);

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
    if (env) {
      await cleanRouteLifecycleEnvironment(admin, [
        env.tenantAId,
        env.tenantBId,
      ]);
    }
    await admin.$disconnect();
    if (app) {
      await app.close();
    }
  });

  describe('GET /api/v1/routes', () => {
    it('rejects unauthenticated requests missing x-tenant-id', async () => {
      const response = await request(server).get('/api/v1/routes');

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        code: 'UNAUTHENTICATED',
      });
    });

    it('returns paginated routes and respects tenant isolation', async () => {
      // Arrange
      const routeA = await createRouteWithStopsAndPackages(admin, {
        tenantId: env.tenantAId,
        requestedByUserId: env.userCoordAId,
        vehicleId: env.vehicle1Id,
        courierId: env.courier1Id,
        depotId: env.depotAId,
        state: 'PLANNED',
        addressId: env.addressAId,
        shipmentTypeId: env.shipmentTypeAId,
      });

      const routeB = await createRouteWithStopsAndPackages(admin, {
        tenantId: env.tenantBId,
        requestedByUserId: env.courierUserBId,
        vehicleId: env.vehicleBId,
        courierId: env.courierBId,
        depotId: env.depotBId,
        state: 'PLANNED',
        addressId: env.addressBId,
        shipmentTypeId: env.shipmentTypeBId,
      });

      // Act: Request as Tenant A
      const responseA = await request(server)
        .get('/api/v1/routes?page=1&pageSize=20')
        .set('x-tenant-id', env.tenantAId)
        .set('x-user-id', env.userCoordAId);

      // Assert
      expect(responseA.status).toBe(200);
      expect(responseA.body.items).toBeDefined();
      const idsA = responseA.body.items.map((r: { id: string }) => r.id);
      expect(idsA).toContain(routeA.routeId);
      expect(idsA).not.toContain(routeB.routeId);
    });

    it('filters routes by state', async () => {
      const response = await request(server)
        .get('/api/v1/routes?state=PLANNED')
        .set('x-tenant-id', env.tenantAId)
        .set('x-user-id', env.userCoordAId);

      expect(response.status).toBe(200);
      expect(response.body.items.every((r: { state: string }) => r.state === 'PLANNED')).toBe(
        true,
      );
    });
  });

  describe('GET /api/v1/routes/:id', () => {
    it('returns route detail with stops ordered by stopNumber', async () => {
      // Arrange
      const fixture = await createRouteWithStopsAndPackages(admin, {
        tenantId: env.tenantAId,
        requestedByUserId: env.userCoordAId,
        vehicleId: env.vehicle1Id,
        courierId: env.courier1Id,
        depotId: env.depotAId,
        state: 'PLANNED',
        addressId: env.addressAId,
        shipmentTypeId: env.shipmentTypeAId,
        stopCount: 2,
      });

      // Act
      const response = await request(server)
        .get(`/api/v1/routes/${fixture.routeId}`)
        .set('x-tenant-id', env.tenantAId)
        .set('x-user-id', env.userCoordAId);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.id).toBe(fixture.routeId);
      expect(response.body.state).toBe('PLANNED');
      expect(response.body.stops.length).toBe(2);
      expect(response.body.stops[0].stopNumber).toBe(1);
      expect(response.body.stops[1].stopNumber).toBe(2);
    });

    it('returns 404 when route belongs to a foreign tenant', async () => {
      // Arrange: Route in Tenant A
      const fixture = await createRouteWithStopsAndPackages(admin, {
        tenantId: env.tenantAId,
        requestedByUserId: env.userCoordAId,
        vehicleId: env.vehicle1Id,
        courierId: env.courier1Id,
        addressId: env.addressAId,
        shipmentTypeId: env.shipmentTypeAId,
      });

      // Act: Request as Tenant B
      const response = await request(server)
        .get(`/api/v1/routes/${fixture.routeId}`)
        .set('x-tenant-id', env.tenantBId)
        .set('x-user-id', env.courierUserBId);

      // Assert
      expect(response.status).toBe(404);
      expect(response.body.code).toBe('ROUTE_NOT_FOUND');
    });

    it('returns 400 when route id is not a valid UUID', async () => {
      const response = await request(server)
        .get('/api/v1/routes/not-a-valid-uuid')
        .set('x-tenant-id', env.tenantAId)
        .set('x-user-id', env.userCoordAId);

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/v1/routes/:id/prepare', () => {
    it('prepares route when depot presence is confirmed with 200 OK', async () => {
      // Arrange
      const fixture = await createRouteWithStopsAndPackages(admin, {
        tenantId: env.tenantAId,
        requestedByUserId: env.userCoordAId,
        vehicleId: env.vehicle1Id,
        courierId: env.courier1Id,
        depotId: env.depotAId,
        state: 'PLANNED',
        addressId: env.addressAId,
        shipmentTypeId: env.shipmentTypeAId,
      });

      // Act
      const response = await request(server)
        .post(`/api/v1/routes/${fixture.routeId}/prepare`)
        .set('x-tenant-id', env.tenantAId)
        .set('x-user-id', env.userCoordAId)
        .send({ depotConfirmed: true });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        routeId: fixture.routeId,
        state: 'READY',
      });
    });

    it('returns 400 when depotConfirmed is missing or false', async () => {
      // Arrange
      const fixture = await createRouteWithStopsAndPackages(admin, {
        tenantId: env.tenantAId,
        requestedByUserId: env.userCoordAId,
        vehicleId: env.vehicle1Id,
        courierId: env.courier1Id,
        addressId: env.addressAId,
        shipmentTypeId: env.shipmentTypeAId,
      });

      // Act
      const response = await request(server)
        .post(`/api/v1/routes/${fixture.routeId}/prepare`)
        .set('x-tenant-id', env.tenantAId)
        .set('x-user-id', env.userCoordAId)
        .send({});

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/v1/routes/:id/start', () => {
    it('starts route when called by assigned courier user with 200 OK', async () => {
      // Arrange: Route in READY
      const fixture = await createRouteWithStopsAndPackages(admin, {
        tenantId: env.tenantAId,
        requestedByUserId: env.userCoordAId,
        vehicleId: env.vehicle1Id,
        courierId: env.courier1Id,
        depotId: env.depotAId,
        state: 'READY',
        packageState: 'READY_FOR_DISPATCH',
        addressId: env.addressAId,
        shipmentTypeId: env.shipmentTypeAId,
      });

      // Act: courierUser1 starts route
      const response = await request(server)
        .post(`/api/v1/routes/${fixture.routeId}/start`)
        .set('x-tenant-id', env.tenantAId)
        .set('x-user-id', env.courierUser1Id)
        .send({});

      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        routeId: fixture.routeId,
        state: 'IN_PROGRESS',
      });
    });

    it('returns 403 Forbidden when called by a non-assigned courier user', async () => {
      // Arrange: Route in READY assigned to courier1
      const fixture = await createRouteWithStopsAndPackages(admin, {
        tenantId: env.tenantAId,
        requestedByUserId: env.userCoordAId,
        vehicleId: env.vehicle1Id,
        courierId: env.courier1Id,
        depotId: env.depotAId,
        state: 'READY',
        packageState: 'READY_FOR_DISPATCH',
        addressId: env.addressAId,
        shipmentTypeId: env.shipmentTypeAId,
      });

      // Act: courierUser2 tries to start
      const response = await request(server)
        .post(`/api/v1/routes/${fixture.routeId}/start`)
        .set('x-tenant-id', env.tenantAId)
        .set('x-user-id', env.courierUser2Id)
        .send({});

      // Assert
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('FORBIDDEN');
    });
  });

  describe('POST /api/v1/routes/:id/cancel', () => {
    it('cancels a PLANNED route with 200 OK', async () => {
      // Arrange
      const fixture = await createRouteWithStopsAndPackages(admin, {
        tenantId: env.tenantAId,
        requestedByUserId: env.userCoordAId,
        vehicleId: env.vehicle1Id,
        courierId: env.courier1Id,
        depotId: env.depotAId,
        state: 'PLANNED',
        addressId: env.addressAId,
        shipmentTypeId: env.shipmentTypeAId,
      });

      // Act
      const response = await request(server)
        .post(`/api/v1/routes/${fixture.routeId}/cancel`)
        .set('x-tenant-id', env.tenantAId)
        .set('x-user-id', env.userCoordAId)
        .send({
          reasonCode: 'CUSTOMER_CANCELLED',
          reason: 'Client rescheduled order delivery',
        });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        routeId: fixture.routeId,
        state: 'CANCELLED',
      });
    });

    it('returns 400 when reasonCode is missing', async () => {
      // Arrange
      const fixture = await createRouteWithStopsAndPackages(admin, {
        tenantId: env.tenantAId,
        requestedByUserId: env.userCoordAId,
        vehicleId: env.vehicle1Id,
        courierId: env.courier1Id,
        addressId: env.addressAId,
        shipmentTypeId: env.shipmentTypeAId,
      });

      // Act
      const response = await request(server)
        .post(`/api/v1/routes/${fixture.routeId}/cancel`)
        .set('x-tenant-id', env.tenantAId)
        .set('x-user-id', env.userCoordAId)
        .send({});

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/v1/routes/:id/interrupt', () => {
    it('interrupts an IN_PROGRESS route with 200 OK', async () => {
      // Arrange: Route in IN_PROGRESS
      const fixture = await createRouteWithStopsAndPackages(admin, {
        tenantId: env.tenantAId,
        requestedByUserId: env.userCoordAId,
        vehicleId: env.vehicle1Id,
        courierId: env.courier1Id,
        depotId: env.depotAId,
        state: 'IN_PROGRESS',
        packageState: 'IN_TRANSIT',
        startedAt: new Date(),
        addressId: env.addressAId,
        shipmentTypeId: env.shipmentTypeAId,
      });

      // Act
      const response = await request(server)
        .post(`/api/v1/routes/${fixture.routeId}/interrupt`)
        .set('x-tenant-id', env.tenantAId)
        .set('x-user-id', env.userCoordAId)
        .send({
          reasonCode: 'VEHICLE_BREAKDOWN',
          reason: 'Engine overheating on route',
        });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        routeId: fixture.routeId,
        state: 'INTERRUPTED',
      });
    });

    it('returns 409 Conflict when attempting to interrupt a READY route', async () => {
      // Arrange: Route in READY
      const fixture = await createRouteWithStopsAndPackages(admin, {
        tenantId: env.tenantAId,
        requestedByUserId: env.userCoordAId,
        vehicleId: env.vehicle1Id,
        courierId: env.courier1Id,
        depotId: env.depotAId,
        state: 'READY',
        packageState: 'READY_FOR_DISPATCH',
        addressId: env.addressAId,
        shipmentTypeId: env.shipmentTypeAId,
      });

      // Act
      const response = await request(server)
        .post(`/api/v1/routes/${fixture.routeId}/interrupt`)
        .set('x-tenant-id', env.tenantAId)
        .set('x-user-id', env.userCoordAId)
        .send({
          reasonCode: 'VEHICLE_BREAKDOWN',
        });

      // Assert
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('ROUTE_STATE_CONFLICT');
    });
  });
});
