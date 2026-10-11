import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, RouteState, PackageState, AssignmentStatus } from '../generated/prisma/client';
import { PrismaService } from '../src/database/prisma.service';
import { PrismaRouteRepository } from '../src/modules/routes/infrastructure/persistence/prisma-route.repository';
import { PrismaRouteCloseUnitOfWork } from '../src/modules/routes/infrastructure/persistence/prisma-route-close-unit-of-work';
import { PrismaRouteSummaryReader } from '../src/modules/routes/infrastructure/persistence/prisma-route-summary-reader';
import { AuthRouteAccessAdapter } from '../src/modules/routes/infrastructure/authorization/auth-route-access.adapter';
import { CloseRouteUseCase } from '../src/modules/routes/application/use-cases/close-route.use-case';
import { GetRouteSummaryUseCase } from '../src/modules/routes/application/use-cases/get-route-summary.use-case';
import {
  RouteNotFoundError,
  RouteForbiddenError,
  RouteCustodyUnresolvedError,
  RouteNotCompletedError,
  IdempotencyKeyReusedError,
} from '../src/modules/routes/domain/route-errors';
import { RouteClosureMode } from '../src/modules/routes/domain/route-closure.types';
import {
  seedRouteCloseEnvironment,
  cleanRouteCloseEnvironment,
  createAllDeliveredRegularRoute,
  createSevenPackagesForcedRoute,
  type RouteCloseEnvironment,
} from './fixtures/route-close-lifecycle.fixtures';

describe('Operational Route Closure and Manifest Reconciliation E2E (ROUTE-CLOSE-01)', () => {
  const admin = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const app = new PrismaService();

  let env: RouteCloseEnvironment;
  let uow: PrismaRouteCloseUnitOfWork;
  let routeRepo: PrismaRouteRepository;
  let summaryReader: PrismaRouteSummaryReader;
  let accessAdapter: AuthRouteAccessAdapter;
  let closeUseCase: CloseRouteUseCase;
  let getSummaryUseCase: GetRouteSummaryUseCase;

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
    await app.onModuleInit();

    env = await seedRouteCloseEnvironment(admin);

    uow = new PrismaRouteCloseUnitOfWork(app);
    routeRepo = new PrismaRouteRepository(app);
    summaryReader = new PrismaRouteSummaryReader(app);
    accessAdapter = new AuthRouteAccessAdapter(app);

    closeUseCase = new CloseRouteUseCase(uow, accessAdapter);
    getSummaryUseCase = new GetRouteSummaryUseCase(routeRepo, summaryReader, accessAdapter);
  });

  afterAll(async () => {
    if (env) {
      await cleanRouteCloseEnvironment(admin, [env.tenantAId, env.tenantBId]);
    }
    await admin.$disconnect();
    await app.onModuleDestroy();
  });

  describe('REGULAR Closure Lifecycle', () => {
    it('successfully closes fully delivered route with exact counts and outbox event (CA-02, CA-03, CA-04, CA-05, CA-08)', async () => {
      // Arrange
      const fixture = await createAllDeliveredRegularRoute(admin, env);
      const requestId = randomUUID();

      // Act
      const result = await closeUseCase.execute({
        tenantId: env.tenantAId,
        routeId: fixture.routeId,
        requestId,
        actorUserId: env.userCoordAId,
        mode: RouteClosureMode.REGULAR,
        actualDistanceM: 5350.5,
      });

      // Assert: Result projection
      expect(result.state).toBe('COMPLETED');
      expect(result.replayed).toBe(false);
      expect(result.routeId).toBe(fixture.routeId);
      expect(result.closureId).toBeDefined();

      const summary = result.summary as Record<string, any>;
      expect(summary.totalAssigned).toBe(3);
      expect(summary.deliveredCount).toBe(3);
      expect(summary.failedCount).toBe(0);
      expect(summary.rescheduledCount).toBe(0);
      expect(summary.returnedCount).toBe(0);
      expect(summary.pendingCount).toBe(0);
      expect(summary.deliveryEffectivenessRatio).toBe(1);

      // Assert: DB state
      const dbRoute = await admin.route.findUnique({
        where: { id: fixture.routeId },
      });
      expect(dbRoute?.state).toBe(RouteState.COMPLETED);
      expect(dbRoute?.completedAt).toBeDefined();

      const dbClosure = await admin.routeClosure.findUnique({
        where: {
          tenantId_routeId: {
            tenantId: env.tenantAId,
            routeId: fixture.routeId,
          },
        },
      });
      expect(dbClosure).toBeDefined();
      expect(dbClosure?.mode).toBe(RouteClosureMode.REGULAR);
      expect(dbClosure?.totalAssigned).toBe(3);
      expect(dbClosure?.deliveredCount).toBe(3);
      expect(Number((dbClosure?.resultSnapshot as any)?.actualDistanceM)).toBe(5350.5);

      // Outbox event
      const outbox = await admin.outboxEvent.findFirst({
        where: {
          tenantId: env.tenantAId,
          eventType: 'RouteCompleted',
        },
      });
      expect(outbox).toBeDefined();
      expect(outbox?.producer).toBe('routes');
      expect(outbox?.version).toBe(1);

      // Audit Log
      const audit = await admin.auditLog.findFirst({
        where: {
          tenantId: env.tenantAId,
          action: 'ROUTE_CLOSED',
          entityId: fixture.routeId,
        },
      });
      expect(audit).toBeDefined();
      expect(audit?.actorUserId).toBe(env.userCoordAId);
    });

    it('rejects REGULAR closure if route has unvisited stops or unresolved custody (CA-03)', async () => {
      // Arrange
      const fixture = await createSevenPackagesForcedRoute(admin, env);
      const requestId = randomUUID();

      // Act & Assert
      await expect(
        closeUseCase.execute({
          tenantId: env.tenantAId,
          routeId: fixture.routeId,
          requestId,
          actorUserId: env.userCoordAId,
          mode: RouteClosureMode.REGULAR,
        }),
      ).rejects.toThrow(RouteCustodyUnresolvedError);

      // Route remains INTERRUPTED
      const dbRoute = await admin.route.findUnique({
        where: { id: fixture.routeId },
      });
      expect(dbRoute?.state).toBe(RouteState.INTERRUPTED);
    });
  });

  describe('FORCED Closure and Manifest Reconciliation', () => {
    it('rejects FORCED closure if custody remaining in vehicle is not physically received (CA-03, CA-06)', async () => {
      // Arrange
      const fixture = await createSevenPackagesForcedRoute(admin, env);
      const requestId = randomUUID();

      // Act & Assert: without depotReceipt
      await expect(
        closeUseCase.execute({
          tenantId: env.tenantAId,
          routeId: fixture.routeId,
          requestId,
          actorUserId: env.userCoordAId,
          mode: RouteClosureMode.FORCED,
          reasonCode: 'VEHICLE_BREAKDOWN',
          notes: 'Mechanical failure',
        }),
      ).rejects.toThrow(RouteCustodyUnresolvedError);
    });

    it('reconciles 7 packages with exact accounting and recovers unvisited packages to PENDING_ASSIGNMENT (CA-03, CA-04, CA-06)', async () => {
      // Arrange: 7 packages route (2 delivered, 1 failed, 1 rescheduled, 1 returned, 2 pending)
      const fixture = await createSevenPackagesForcedRoute(admin, env);
      const requestId = randomUUID();

      // Act: FORCED closure with physical receipt at depot
      const result = await closeUseCase.execute({
        tenantId: env.tenantAId,
        routeId: fixture.routeId,
        requestId,
        actorUserId: env.userCoordAId,
        mode: RouteClosureMode.FORCED,
        reasonCode: 'VEHICLE_BREAKDOWN',
        notes: 'Mechanical failure north sector; depot received cargo',
        depotReceipt: {
          depotId: env.depotAId,
          physicalReceiptConfirmed: true,
          assignmentIds: fixture.unresolvedAssignmentIds,
        },
      });

      // Assert: Invariant 7 = 2 + 1 + 1 + 1 + 2
      expect(result.state).toBe('COMPLETED');
      const summary = result.summary as Record<string, any>;
      expect(summary.totalAssigned).toBe(7);
      expect(summary.deliveredCount).toBe(2);
      expect(summary.failedCount).toBe(1);
      expect(summary.rescheduledCount).toBe(1);
      expect(summary.returnedCount).toBe(1);
      expect(summary.pendingCount).toBe(2);
      expect(summary.deliveryEffectivenessRatio).toBeCloseTo(2 / 7, 4);

      // Assert: Unvisited packages recovered to PENDING_ASSIGNMENT
      for (const pendingPkgId of fixture.pendingPkgIds) {
        const pkg = await admin.package.findUnique({
          where: { id: pendingPkgId },
        });
        expect(pkg?.state).toBe(PackageState.PENDING_ASSIGNMENT);

        const history = await admin.packageStatusHistory.findFirst({
          where: {
            packageId: pendingPkgId,
            toState: PackageState.PENDING_ASSIGNMENT,
          },
        });
        expect(history).toBeDefined();
        expect(history?.reasonCode).toBe('VEHICLE_BREAKDOWN');
      }

      // Assert: All 7 assignments are ENDED (none ACTIVE)
      const activeAssignments = await admin.assignment.findMany({
        where: {
          routeId: fixture.routeId,
          status: AssignmentStatus.ACTIVE,
        },
      });
      expect(activeAssignments.length).toBe(0);

      // DB RouteClosure mode is FORCED with reasons
      const closure = await admin.routeClosure.findUnique({
        where: {
          tenantId_routeId: {
            tenantId: env.tenantAId,
            routeId: fixture.routeId,
          },
        },
      });
      expect(closure?.mode).toBe(RouteClosureMode.FORCED);
      expect(closure?.reasonCode).toBe('VEHICLE_BREAKDOWN');
      expect(closure?.notes).toContain('Mechanical failure');
    });
  });

  describe('Replay Idempotency & SHA-256 (CA-09)', () => {
    it('returns cached snapshot on identical replay and rejects modified body with 409 (CA-09)', async () => {
      // Arrange
      const fixture = await createAllDeliveredRegularRoute(admin, env);
      const requestId = randomUUID();

      // First execution
      const first = await closeUseCase.execute({
        tenantId: env.tenantAId,
        routeId: fixture.routeId,
        requestId,
        actorUserId: env.userCoordAId,
        mode: RouteClosureMode.REGULAR,
      });
      expect(first.replayed).toBe(false);

      const outboxCountBefore = await admin.outboxEvent.count({
        where: { tenantId: env.tenantAId, eventType: 'RouteCompleted' },
      });

      // Second execution: exact replay
      const second = await closeUseCase.execute({
        tenantId: env.tenantAId,
        routeId: fixture.routeId,
        requestId,
        actorUserId: env.userCoordAId,
        mode: RouteClosureMode.REGULAR,
      });
      expect(second.replayed).toBe(true);
      expect(second.closureId).toBe(first.closureId);

      // No second outbox event created
      const outboxCountAfter = await admin.outboxEvent.count({
        where: { tenantId: env.tenantAId, eventType: 'RouteCompleted' },
      });
      expect(outboxCountAfter).toBe(outboxCountBefore);

      // Third execution: same requestId, but different payload -> IdempotencyKeyReusedError
      await expect(
        closeUseCase.execute({
          tenantId: env.tenantAId,
          routeId: fixture.routeId,
          requestId,
          actorUserId: env.userCoordAId,
          mode: RouteClosureMode.FORCED,
          reasonCode: 'TAMPERED',
          notes: 'Tampered notes',
        }),
      ).rejects.toThrow(IdempotencyKeyReusedError);
    });
  });

  describe('Route Summary Access and Role Projections (CA-01, CA-05)', () => {
    it('returns full summary to coordinator and projected summary without internal notes to courier (CA-01, CA-05)', async () => {
      // Arrange: close a route with notes
      const fixture = await createAllDeliveredRegularRoute(admin, env);
      const requestId = randomUUID();

      await closeUseCase.execute({
        tenantId: env.tenantAId,
        routeId: fixture.routeId,
        requestId,
        actorUserId: env.userCoordAId,
        mode: RouteClosureMode.REGULAR,
        notes: 'Confidential coordinator observation',
      });

      // Coordinator read
      const coordSummary = await getSummaryUseCase.execute({
        tenantId: env.tenantAId,
        routeId: fixture.routeId,
        actorUserId: env.userCoordAId,
      });
      expect(coordSummary).toBeDefined();
      expect(coordSummary.totalAssigned).toBe(3);

      // Courier 1 read (assigned courier)
      const courierSummary = await getSummaryUseCase.execute({
        tenantId: env.tenantAId,
        routeId: fixture.routeId,
        actorUserId: env.courierUser1Id,
      });
      expect(courierSummary).toBeDefined();
      expect(courierSummary.totalAssigned).toBe(3);
      // Redacted fields
      expect(courierSummary).not.toHaveProperty('notes');
      expect(courierSummary).not.toHaveProperty('reasonCode');
    });

    it('rejects summary query if route is not completed (CA-05)', async () => {
      // Route is still IN_PROGRESS
      const fixture = await createAllDeliveredRegularRoute(admin, env);

      await expect(
        getSummaryUseCase.execute({
          tenantId: env.tenantAId,
          routeId: fixture.routeId,
          actorUserId: env.userCoordAId,
        }),
      ).rejects.toThrow(RouteNotCompletedError);
    });
  });

  describe('Multi-Tenant Isolation & RLS Security with sls_app (CA-01, CA-12)', () => {
    it('prevents Tenant B from closing Tenant A route and reading summary (CA-01, CA-12)', async () => {
      const fixture = await createAllDeliveredRegularRoute(admin, env);
      const requestId = randomUUID();

      // Tenant B tries to close Tenant A's route
      await expect(
        closeUseCase.execute({
          tenantId: env.tenantBId,
          routeId: fixture.routeId,
          requestId,
          actorUserId: env.userCoordBId,
          mode: RouteClosureMode.REGULAR,
        }),
      ).rejects.toThrow(RouteNotFoundError);

      // Close it legally in Tenant A
      await closeUseCase.execute({
        tenantId: env.tenantAId,
        routeId: fixture.routeId,
        requestId,
        actorUserId: env.userCoordAId,
        mode: RouteClosureMode.REGULAR,
      });

      // Tenant B tries to read Tenant A's route summary
      await expect(
        getSummaryUseCase.execute({
          tenantId: env.tenantBId,
          routeId: fixture.routeId,
          actorUserId: env.userCoordBId,
        }),
      ).rejects.toThrow(RouteNotFoundError);
    });
  });
});
