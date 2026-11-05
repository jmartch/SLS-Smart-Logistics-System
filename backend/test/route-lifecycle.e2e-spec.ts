import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  AssignmentStatus,
  PackageState,
  PrismaClient,
  RouteState,
} from '../generated/prisma/client';
import { PrismaService } from '../src/database/prisma.service';
import { PrismaRouteRepository } from '../src/modules/routes/infrastructure/persistence/prisma-route.repository';
import { PrismaRouteLifecycleUnitOfWork } from '../src/modules/routes/infrastructure/persistence/prisma-route-lifecycle-unit-of-work';
import { PrismaRouteResourcesAdapter } from '../src/modules/routes/infrastructure/persistence/prisma-route-resources.adapter';
import { AuthRouteAccessAdapter } from '../src/modules/routes/infrastructure/authorization/auth-route-access.adapter';
import { PrepareRouteUseCase } from '../src/modules/routes/application/use-cases/prepare-route.use-case';
import { StartRouteUseCase } from '../src/modules/routes/application/use-cases/start-route.use-case';
import { CancelRouteUseCase } from '../src/modules/routes/application/use-cases/cancel-route.use-case';
import { InterruptRouteUseCase } from '../src/modules/routes/application/use-cases/interrupt-route.use-case';
import { GetRouteDetailUseCase } from '../src/modules/routes/application/use-cases/get-route-detail.use-case';
import { ListRoutesUseCase } from '../src/modules/routes/application/use-cases/list-routes.use-case';
import {
  RouteForbiddenError,
  RouteNotFoundError,
  RouteResourceUnavailableError,
  RouteStateConflictError,
  RouteValidationError,
} from '../src/modules/routes/domain/route-errors';
import {
  cleanRouteLifecycleEnvironment,
  createRouteWithStopsAndPackages,
  seedRouteLifecycleEnvironment,
  type RouteLifecycleEnvironment,
} from './fixtures/route-lifecycle.fixtures';

describe('Operational Route Lifecycle and Integrity E2E (ROUTE-01)', () => {
  const admin = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL,
    }),
  });
  const app = new PrismaService();

  let env: RouteLifecycleEnvironment;
  let uow: PrismaRouteLifecycleUnitOfWork;
  let routeRepo: PrismaRouteRepository;
  let resourcesAdapter: PrismaRouteResourcesAdapter;
  let accessAdapter: AuthRouteAccessAdapter;

  let prepareUseCase: PrepareRouteUseCase;
  let startUseCase: StartRouteUseCase;
  let cancelUseCase: CancelRouteUseCase;
  let interruptUseCase: InterruptRouteUseCase;
  let getDetailUseCase: GetRouteDetailUseCase;
  let listRoutesUseCase: ListRoutesUseCase;

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
    await app.$connect();

    env = await seedRouteLifecycleEnvironment(admin);

    uow = new PrismaRouteLifecycleUnitOfWork(app);
    routeRepo = new PrismaRouteRepository(app);
    resourcesAdapter = new PrismaRouteResourcesAdapter(app);
    accessAdapter = new AuthRouteAccessAdapter(app);

    prepareUseCase = new PrepareRouteUseCase(
      uow,
      accessAdapter,
      resourcesAdapter,
    );
    startUseCase = new StartRouteUseCase(uow, accessAdapter, resourcesAdapter);
    cancelUseCase = new CancelRouteUseCase(uow, accessAdapter);
    interruptUseCase = new InterruptRouteUseCase(uow, accessAdapter);
    getDetailUseCase = new GetRouteDetailUseCase(routeRepo, accessAdapter);
    listRoutesUseCase = new ListRoutesUseCase(routeRepo, accessAdapter);
  });

  afterAll(async () => {
    if (env) {
      await cleanRouteLifecycleEnvironment(admin, [
        env.tenantAId,
        env.tenantBId,
      ]);
    }
    await app.$disconnect();
    await admin.$disconnect();
  });

  describe('Full operational route progression (PLANNED -> READY -> IN_PROGRESS -> INTERRUPTED)', () => {
    it('prepares, starts and interrupts a route atomically while updating packages and outbox', async () => {
      // Arrange: create a PLANNED route with 2 stops and packages
      const fixture = await createRouteWithStopsAndPackages(admin, {
        tenantId: env.tenantAId,
        requestedByUserId: env.userCoordAId,
        vehicleId: env.vehicle1Id,
        courierId: env.courier1Id,
        depotId: env.depotAId,
        state: 'PLANNED',
        addressId: env.addressAId,
        shipmentTypeId: env.shipmentTypeAId,
        zoneId: env.zoneAId,
        stopCount: 2,
      });

      // Step 1: PREPARE (PLANNED -> READY)
      const prepareResult = await prepareUseCase.execute({
        tenantId: env.tenantAId,
        actorUserId: env.userCoordAId,
        correlationId: randomUUID(),
        routeId: fixture.routeId,
        depotConfirmed: true,
      });

      expect(prepareResult.state).toBe(RouteState.READY);
      expect(prepareResult.updatedPackagesCount).toBe(2);

      // Assert database after prepare
      const routeAfterPrepare = await admin.route.findUniqueOrThrow({
        where: { id: fixture.routeId },
      });
      expect(routeAfterPrepare.state).toBe(RouteState.READY);

      const packagesAfterPrepare = await admin.package.findMany({
        where: { id: { in: fixture.packageIds } },
      });
      expect(
        packagesAfterPrepare.every(
          (p) => p.state === PackageState.READY_FOR_DISPATCH,
        ),
      ).toBe(true);

      const outboxPrepare = await admin.outboxEvent.findFirst({
        where: {
          tenantId: env.tenantAId,
          eventType: 'RoutePrepared',
        },
      });
      expect(outboxPrepare).not.toBeNull();

      // Step 2: START (READY -> IN_PROGRESS)
      const startResult = await startUseCase.execute({
        tenantId: env.tenantAId,
        actorUserId: env.courierUser1Id,
        correlationId: randomUUID(),
        routeId: fixture.routeId,
      });

      expect(startResult.state).toBe(RouteState.IN_PROGRESS);
      expect(startResult.startedAt).toBeDefined();

      // Assert database after start
      const routeAfterStart = await admin.route.findUniqueOrThrow({
        where: { id: fixture.routeId },
      });
      expect(routeAfterStart.state).toBe(RouteState.IN_PROGRESS);
      expect(routeAfterStart.startedAt).not.toBeNull();

      const packagesAfterStart = await admin.package.findMany({
        where: { id: { in: fixture.packageIds } },
      });
      expect(
        packagesAfterStart.every((p) => p.state === PackageState.IN_TRANSIT),
      ).toBe(true);

      // Step 3: INTERRUPT (IN_PROGRESS -> INTERRUPTED)
      const interruptResult = await interruptUseCase.execute({
        tenantId: env.tenantAId,
        actorUserId: env.userCoordAId,
        correlationId: randomUUID(),
        routeId: fixture.routeId,
        reasonCode: 'VEHICLE_BREAKDOWN',
        reason: 'Flat tire on highway 90',
      });

      expect(interruptResult.state).toBe(RouteState.INTERRUPTED);

      // Assert database after interrupt
      const routeAfterInterrupt = await admin.route.findUniqueOrThrow({
        where: { id: fixture.routeId },
      });
      expect(routeAfterInterrupt.state).toBe(RouteState.INTERRUPTED);

      // Packages remain IN_TRANSIT and assignments remain ACTIVE
      const packagesAfterInterrupt = await admin.package.findMany({
        where: { id: { in: fixture.packageIds } },
      });
      expect(
        packagesAfterInterrupt.every(
          (p) => p.state === PackageState.IN_TRANSIT,
        ),
      ).toBe(true);

      const assignmentsAfterInterrupt = await admin.assignment.findMany({
        where: { id: { in: fixture.assignmentIds } },
      });
      expect(
        assignmentsAfterInterrupt.every(
          (a) => a.status === AssignmentStatus.ACTIVE,
        ),
      ).toBe(true);
    });
  });

  describe('Route cancellation pre-dispatch (PLANNED / READY -> CANCELLED)', () => {
    it('cancels a READY route, reverts packages to PENDING_ASSIGNMENT, and marks assignments CANCELLED', async () => {
      // Arrange: create a READY route
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
        stopCount: 2,
      });

      // Act
      const cancelResult = await cancelUseCase.execute({
        tenantId: env.tenantAId,
        actorUserId: env.userCoordAId,
        correlationId: randomUUID(),
        routeId: fixture.routeId,
        reasonCode: 'SEVERE_WEATHER',
        reason: 'Tropical storm warning in operational area',
      });

      // Assert
      expect(cancelResult.state).toBe(RouteState.CANCELLED);

      const routeDb = await admin.route.findUniqueOrThrow({
        where: { id: fixture.routeId },
      });
      expect(routeDb.state).toBe(RouteState.CANCELLED);

      const packagesDb = await admin.package.findMany({
        where: { id: { in: fixture.packageIds } },
      });
      expect(
        packagesDb.every((p) => p.state === PackageState.PENDING_ASSIGNMENT),
      ).toBe(true);

      const assignmentsDb = await admin.assignment.findMany({
        where: { id: { in: fixture.assignmentIds } },
      });
      expect(
        assignmentsDb.every((a) => a.status === AssignmentStatus.CANCELLED),
      ).toBe(true);
      expect(assignmentsDb.every((a) => a.endedAt !== null)).toBe(true);
    });

    it('rejects cancellation when the route is already IN_PROGRESS', async () => {
      // Arrange: route in progress
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

      // Act & Assert
      await expect(
        cancelUseCase.execute({
          tenantId: env.tenantAId,
          actorUserId: env.userCoordAId,
          correlationId: randomUUID(),
          routeId: fixture.routeId,
          reasonCode: 'OPERATIONAL_CHANGE',
        }),
      ).rejects.toThrow(RouteStateConflictError);
    });
  });

  describe('Invariant validations and business resource rules', () => {
    it('rejects route preparation when depot presence is not confirmed', async () => {
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

      // Act & Assert
      await expect(
        prepareUseCase.execute({
          tenantId: env.tenantAId,
          actorUserId: env.userCoordAId,
          correlationId: randomUUID(),
          routeId: fixture.routeId,
          depotConfirmed: false,
        }),
      ).rejects.toThrow(RouteValidationError);
    });

    it('rejects route preparation when assigned vehicle is under MAINTENANCE', async () => {
      // Arrange: create route with vehicleMaintId
      const fixture = await createRouteWithStopsAndPackages(admin, {
        tenantId: env.tenantAId,
        requestedByUserId: env.userCoordAId,
        vehicleId: env.vehicleMaintId,
        courierId: env.courier1Id,
        depotId: env.depotAId,
        state: 'PLANNED',
        addressId: env.addressAId,
        shipmentTypeId: env.shipmentTypeAId,
      });

      // Act & Assert
      await expect(
        prepareUseCase.execute({
          tenantId: env.tenantAId,
          actorUserId: env.userCoordAId,
          correlationId: randomUUID(),
          routeId: fixture.routeId,
          depotConfirmed: true,
        }),
      ).rejects.toThrow(RouteResourceUnavailableError);
    });

    it('rejects starting route when actor is not the courier assigned to the route', async () => {
      // Arrange: route in READY assigned to courier1
      const fixture = await createRouteWithStopsAndPackages(admin, {
        tenantId: env.tenantAId,
        requestedByUserId: env.userCoordAId,
        vehicleId: env.vehicle1Id,
        courierId: env.courier1Id,
        depotId: env.depotAId,
        state: 'READY',
        addressId: env.addressAId,
        shipmentTypeId: env.shipmentTypeAId,
      });

      // Act & Assert: courierUser2 tries to start courier1's route
      await expect(
        startUseCase.execute({
          tenantId: env.tenantAId,
          actorUserId: env.courierUser2Id,
          correlationId: randomUUID(),
          routeId: fixture.routeId,
        }),
      ).rejects.toThrow(RouteForbiddenError);
    });
  });

  describe('Multi-tenant isolation', () => {
    it('prevents Tenant B from viewing, preparing, starting or cancelling Tenant A routes', async () => {
      // Arrange: Route in Tenant A
      const fixtureA = await createRouteWithStopsAndPackages(admin, {
        tenantId: env.tenantAId,
        requestedByUserId: env.userCoordAId,
        vehicleId: env.vehicle1Id,
        courierId: env.courier1Id,
        depotId: env.depotAId,
        state: 'PLANNED',
        addressId: env.addressAId,
        shipmentTypeId: env.shipmentTypeAId,
      });

      // Act & Assert: Tenant B tries to access Tenant A's route
      await expect(
        getDetailUseCase.execute({
          tenantId: env.tenantBId,
          actorUserId: env.courierUserBId,
          correlationId: randomUUID(),
          routeId: fixtureA.routeId,
        }),
      ).rejects.toThrow(RouteNotFoundError);

      await expect(
        prepareUseCase.execute({
          tenantId: env.tenantBId,
          actorUserId: env.courierUserBId,
          correlationId: randomUUID(),
          routeId: fixtureA.routeId,
          depotConfirmed: true,
        }),
      ).rejects.toThrow(RouteNotFoundError);

      await expect(
        startUseCase.execute({
          tenantId: env.tenantBId,
          actorUserId: env.courierUserBId,
          correlationId: randomUUID(),
          routeId: fixtureA.routeId,
        }),
      ).rejects.toThrow(RouteNotFoundError);

      await expect(
        cancelUseCase.execute({
          tenantId: env.tenantBId,
          actorUserId: env.courierUserBId,
          correlationId: randomUUID(),
          routeId: fixtureA.routeId,
          reasonCode: 'CROSS_TENANT_ATTEMPT',
        }),
      ).rejects.toThrow(RouteNotFoundError);
    });

    it('isolates route lists by tenant', async () => {
      // Arrange: create 1 route for Tenant A and 1 route for Tenant B
      await createRouteWithStopsAndPackages(admin, {
        tenantId: env.tenantAId,
        requestedByUserId: env.userCoordAId,
        vehicleId: env.vehicle1Id,
        courierId: env.courier1Id,
        addressId: env.addressAId,
        shipmentTypeId: env.shipmentTypeAId,
      });

      await createRouteWithStopsAndPackages(admin, {
        tenantId: env.tenantBId,
        requestedByUserId: env.courierUserBId,
        vehicleId: env.vehicleBId,
        courierId: env.courierBId,
        addressId: env.addressBId,
        shipmentTypeId: env.shipmentTypeBId,
      });

      // Act
      const listA = await listRoutesUseCase.execute({
        tenantId: env.tenantAId,
        actorUserId: env.userCoordAId,
        correlationId: randomUUID(),
        page: 1,
        pageSize: 50,
      });

      const listB = await listRoutesUseCase.execute({
        tenantId: env.tenantBId,
        actorUserId: env.courierUserBId,
        correlationId: randomUUID(),
        page: 1,
        pageSize: 50,
      });

      // Assert: no cross-contamination
      expect(listA.items.every((r) => r.tenantId === env.tenantAId)).toBe(true);
      expect(listB.items.every((r) => r.tenantId === env.tenantBId)).toBe(true);
      expect(listA.items.some((r) => r.tenantId === env.tenantBId)).toBe(false);
      expect(listB.items.some((r) => r.tenantId === env.tenantAId)).toBe(false);
    });
  });

  describe('GoF Stop Iterator in detail projection', () => {
    it('returns stops ordered strictly by stopNumber via the domain Iterator', async () => {
      // Arrange: route with 3 stops
      const fixture = await createRouteWithStopsAndPackages(admin, {
        tenantId: env.tenantAId,
        requestedByUserId: env.userCoordAId,
        vehicleId: env.vehicle1Id,
        courierId: env.courier1Id,
        depotId: env.depotAId,
        state: 'PLANNED',
        addressId: env.addressAId,
        shipmentTypeId: env.shipmentTypeAId,
        stopCount: 3,
      });

      // Act
      const detail = await getDetailUseCase.execute({
        tenantId: env.tenantAId,
        actorUserId: env.userCoordAId,
        correlationId: randomUUID(),
        routeId: fixture.routeId,
      });

      // Assert
      expect(detail.id).toBe(fixture.routeId);
      expect(detail.stops.length).toBe(3);
      expect(detail.stops[0].stopNumber).toBe(1);
      expect(detail.stops[1].stopNumber).toBe(2);
      expect(detail.stops[2].stopNumber).toBe(3);
    });
  });
});
