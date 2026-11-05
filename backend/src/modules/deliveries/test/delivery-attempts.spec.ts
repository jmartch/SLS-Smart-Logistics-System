import { PackageAggregate } from '../../packages/domain/package.aggregate';
import { Route } from '../../routes/domain/route';
import { RouteState } from '../../routes/domain/route-state';
import { RouteStop } from '../../routes/domain/route-stop';
import { RouteStopState } from '../../routes/domain/route-stop-state';
import { AttendRouteStopUseCase } from '../application/use-cases/attend-route-stop.use-case';
import { RecordSuccessfulDeliveryUseCase } from '../application/use-cases/record-successful-delivery.use-case';
import { RecordFailedDeliveryUseCase } from '../application/use-cases/record-failed-delivery.use-case';
import {
  DeliveryForbiddenError,
  DeliveryStateConflictError,
  DeliveryValidationError,
  IdempotencyConflictError,
  StopStateConflictError,
} from '../domain/delivery-errors';
import { DeliveryFailureReason } from '../domain/delivery-failure-reason';
import {
  FakeDeliveryAccessPort,
  FakeDeliveryUnitOfWork,
  FakeEvidenceStoragePort,
} from './fixtures/delivery-unit-of-work.fake';

// --- Fixtures & Context Helpers ---

const TENANT_ID = 'tenant-1';
const ACTOR_USER_ID = 'user-courier-1';
const ROUTE_ID = 'route-1';
const STOP_ID = 'stop-1';
const COURIER_ID = 'courier-1';

function createRouteFixture(
  stops: readonly RouteStop[],
  overrides: { state?: RouteState; id?: string } = {},
): Route {
  return new Route({
    id: overrides.id ?? ROUTE_ID,
    tenantId: TENANT_ID,
    planningRequestId: 'plan-1',
    vehicleId: 'vehicle-1',
    courierId: COURIER_ID,
    state: overrides.state ?? RouteState.IN_PROGRESS,
    plannedAt: new Date('2026-10-06T08:00:00.000Z'),
    stops,
  });
}

function createStopFixture(
  stopNumber = 1,
  overrides: { id?: string; state?: RouteStopState } = {},
): RouteStop {
  return new RouteStop({
    id: overrides.id ?? STOP_ID,
    tenantId: TENANT_ID,
    routeId: ROUTE_ID,
    stopNumber,
    latitude: 10.9878,
    longitude: -74.7889,
    state: overrides.state ?? RouteStopState.PENDING,
  });
}

function createPackageFixture(
  id: string,
  state:
    | 'IN_TRANSIT'
    | 'OUT_FOR_DELIVERY'
    | 'READY_FOR_DISPATCH'
    | 'DELIVERED' = 'IN_TRANSIT',
): PackageAggregate {
  return PackageAggregate.reconstitute({
    id,
    tenantId: TENANT_ID,
    state,
  });
}

function createTestContext() {
  const uow = new FakeDeliveryUnitOfWork();
  const accessPort = new FakeDeliveryAccessPort();
  const storagePort = new FakeEvidenceStoragePort();

  const attendStopUseCase = new AttendRouteStopUseCase(uow, accessPort);
  const recordSuccessUseCase = new RecordSuccessfulDeliveryUseCase(
    uow,
    accessPort,
    storagePort,
  );
  const recordFailedUseCase = new RecordFailedDeliveryUseCase(
    uow,
    accessPort,
    storagePort,
  );

  return {
    uow,
    session: uow.session,
    accessPort,
    storagePort,
    attendStopUseCase,
    recordSuccessUseCase,
    recordFailedUseCase,
  };
}

describe('Delivery Attempts Application Use Cases', () => {
  describe('AttendRouteStopUseCase', () => {
    it('attends a stop and marks all in-transit packages as out-for-delivery', async () => {
      // Arrange
      const { session, attendStopUseCase } = createTestContext();
      const stop = createStopFixture(1);
      const route = createRouteFixture([stop]);
      const pkg1 = createPackageFixture('pkg-1', 'IN_TRANSIT');
      const pkg2 = createPackageFixture('pkg-2', 'IN_TRANSIT');

      session.routes.set(route.id, route);
      session.stops.set(stop.id, stop);
      session.packages.set(pkg1.id, pkg1);
      session.packages.set(pkg2.id, pkg2);
      session.stopPackages.set(stop.id, [pkg1.id, pkg2.id]);

      // Act
      const result = await attendStopUseCase.execute({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        routeId: route.id,
        stopId: stop.id,
        requestId: 'req-attend-1',
      });

      // Assert
      expect(result.stopId).toBe(stop.id);
      expect(result.replayed).toBe(false);
      expect(result.affectedPackageIds).toEqual(['pkg-1', 'pkg-2']);
      expect(pkg1.state).toBe('OUT_FOR_DELIVERY');
      expect(pkg2.state).toBe('OUT_FOR_DELIVERY');
      expect(session.outbox).toHaveLength(2);
      expect(session.outbox[0]?.eventType).toBe('PackageOutForDelivery');
    });

    it('replays identical result when the same idempotency requestId is received', async () => {
      // Arrange
      const { session, attendStopUseCase } = createTestContext();
      const stop = createStopFixture(1);
      const route = createRouteFixture([stop]);
      const pkg = createPackageFixture('pkg-1', 'IN_TRANSIT');

      session.routes.set(route.id, route);
      session.stops.set(stop.id, stop);
      session.packages.set(pkg.id, pkg);
      session.stopPackages.set(stop.id, [pkg.id]);

      const command = {
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        routeId: route.id,
        stopId: stop.id,
        requestId: 'req-attend-replay',
      };

      // Act
      const firstResult = await attendStopUseCase.execute(command);
      const replayResult = await attendStopUseCase.execute(command);

      // Assert
      expect(firstResult.replayed).toBe(false);
      expect(replayResult.replayed).toBe(true);
      expect(replayResult.stopId).toBe(stop.id);
      expect(replayResult.affectedPackageIds).toEqual(
        firstResult.affectedPackageIds,
      );
      expect(session.outbox).toHaveLength(1); // No new events on replay
    });

    it('rejects when the same requestId is reused with a different stop', async () => {
      // Arrange
      const { session, attendStopUseCase } = createTestContext();
      const stop = createStopFixture(1);
      const route = createRouteFixture([stop]);

      session.routes.set(route.id, route);
      session.stops.set(stop.id, stop);

      await attendStopUseCase.execute({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        routeId: route.id,
        stopId: stop.id,
        requestId: 'req-conflict',
      });

      // Act & Assert
      await expect(
        attendStopUseCase.execute({
          tenantId: TENANT_ID,
          actorUserId: ACTOR_USER_ID,
          routeId: route.id,
          stopId: 'different-stop',
          requestId: 'req-conflict',
        }),
      ).rejects.toThrow(IdempotencyConflictError);
    });

    it('rejects when the route is not in IN_PROGRESS state', async () => {
      // Arrange
      const { session, attendStopUseCase } = createTestContext();
      const stop = createStopFixture(1);
      const route = createRouteFixture([stop], { state: RouteState.READY });

      session.routes.set(route.id, route);
      session.stops.set(stop.id, stop);

      // Act & Assert
      await expect(
        attendStopUseCase.execute({
          tenantId: TENANT_ID,
          actorUserId: ACTOR_USER_ID,
          routeId: route.id,
          stopId: stop.id,
          requestId: 'req-not-started',
        }),
      ).rejects.toThrow(DeliveryStateConflictError);
    });

    it('rejects when the actor is not the assigned courier', async () => {
      // Arrange
      const { session, accessPort, attendStopUseCase } = createTestContext();
      const stop = createStopFixture(1);
      const route = createRouteFixture([stop]);

      session.routes.set(route.id, route);
      session.stops.set(stop.id, stop);
      accessPort.allowAttend = false;

      // Act & Assert
      await expect(
        attendStopUseCase.execute({
          tenantId: TENANT_ID,
          actorUserId: 'unauthorized-user',
          routeId: route.id,
          stopId: stop.id,
          requestId: 'req-forbidden',
        }),
      ).rejects.toThrow(DeliveryForbiddenError);
    });

    it('rejects when the stop is already completed', async () => {
      // Arrange
      const { session, attendStopUseCase } = createTestContext();
      const stop = createStopFixture(1, { state: RouteStopState.COMPLETED });
      const route = createRouteFixture([stop]);

      session.routes.set(route.id, route);
      session.stops.set(stop.id, stop);

      // Act & Assert
      await expect(
        attendStopUseCase.execute({
          tenantId: TENANT_ID,
          actorUserId: ACTOR_USER_ID,
          routeId: route.id,
          stopId: stop.id,
          requestId: 'req-already-completed',
        }),
      ).rejects.toThrow(StopStateConflictError);
    });
  });

  describe('RecordSuccessfulDeliveryUseCase', () => {
    it('records a successful delivery, ends assignment, and completes the stop', async () => {
      // Arrange
      const { session, storagePort, recordSuccessUseCase } =
        createTestContext();
      const stop = createStopFixture(1);
      const route = createRouteFixture([stop]);
      const pkg = createPackageFixture('pkg-1', 'OUT_FOR_DELIVERY');

      session.routes.set(route.id, route);
      session.stops.set(stop.id, stop);
      session.packages.set(pkg.id, pkg);
      session.stopPackages.set(stop.id, [pkg.id]);
      session.assignments.set('assign-1', {
        packageId: pkg.id,
        routeId: route.id,
        status: 'ACTIVE',
      });

      const photoBuffer = Buffer.from('photo-bytes');

      // Act
      const result = await recordSuccessUseCase.execute({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        routeId: route.id,
        stopId: stop.id,
        packageId: pkg.id,
        files: [{ buffer: photoBuffer, type: 'PHOTO', mimeType: 'image/jpeg' }],
        notes: 'Handed to recipient in person',
        requestId: 'req-success-1',
      });

      // Assert
      expect(result.outcome).toBe('DELIVERED');
      expect(result.stopResolution).toBe('COMPLETED');
      expect(result.replayed).toBe(false);
      expect(pkg.state).toBe('DELIVERED');
      expect(session.assignments.get('assign-1')?.status).toBe('ENDED');
      expect(session.attempts).toHaveLength(1);
      expect(session.attempts[0]?.outcome).toBe('DELIVERED');
      expect(storagePort.storedFiles.size).toBe(1);
      expect(
        session.outbox.some((e) => e.eventType === 'PackageDelivered'),
      ).toBe(true);
      expect(
        session.outbox.some((e) => e.eventType === 'DeliveryAttempted'),
      ).toBe(true);
    });

    it('keeps stop PENDING in multi-package stop when one package succeeds but another remains', async () => {
      // Arrange
      const { session, recordSuccessUseCase } = createTestContext();
      const stop = createStopFixture(1);
      const route = createRouteFixture([stop]);
      const pkg1 = createPackageFixture('pkg-1', 'OUT_FOR_DELIVERY');
      const pkg2 = createPackageFixture('pkg-2', 'OUT_FOR_DELIVERY');

      session.routes.set(route.id, route);
      session.stops.set(stop.id, stop);
      session.packages.set(pkg1.id, pkg1);
      session.packages.set(pkg2.id, pkg2);
      session.stopPackages.set(stop.id, [pkg1.id, pkg2.id]);
      session.assignments.set('assign-1', {
        packageId: pkg1.id,
        routeId: route.id,
        status: 'ACTIVE',
      });

      // Act
      const result = await recordSuccessUseCase.execute({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        routeId: route.id,
        stopId: stop.id,
        packageId: pkg1.id,
        files: [
          {
            buffer: Buffer.from('photo'),
            type: 'PHOTO',
            mimeType: 'image/png',
          },
        ],
        requestId: 'req-success-multi',
      });

      // Assert
      expect(result.outcome).toBe('DELIVERED');
      expect(result.stopResolution).toBe('PENDING');
      expect(pkg1.state).toBe('DELIVERED');
      expect(pkg2.state).toBe('OUT_FOR_DELIVERY');
    });

    it('cleans up stored files if the transaction commits with an error (rollback simulation)', async () => {
      // Arrange
      const { uow, session, storagePort, recordSuccessUseCase } =
        createTestContext();
      const stop = createStopFixture(1);
      const route = createRouteFixture([stop]);
      const pkg = createPackageFixture('pkg-1', 'OUT_FOR_DELIVERY');

      session.routes.set(route.id, route);
      session.stops.set(stop.id, stop);
      session.packages.set(pkg.id, pkg);
      session.stopPackages.set(stop.id, [pkg.id]);
      session.assignments.set('assign-1', {
        packageId: pkg.id,
        routeId: route.id,
        status: 'ACTIVE',
      });

      uow.shouldFailCommit = true; // Simular fallo de commit en UoW

      // Act & Assert
      await expect(
        recordSuccessUseCase.execute({
          tenantId: TENANT_ID,
          actorUserId: ACTOR_USER_ID,
          routeId: route.id,
          stopId: stop.id,
          packageId: pkg.id,
          files: [
            {
              buffer: Buffer.from('signature'),
              type: 'SIGNATURE',
              mimeType: 'image/png',
            },
          ],
          requestId: 'req-fail-tx',
        }),
      ).rejects.toThrow('Simulated transaction commit failure');

      // Assert: No deben quedar archivos huérfanos en disco tras el rollback
      expect(storagePort.storedFiles.size).toBe(0);
    });

    it('rejects when no evidence files are attached', async () => {
      // Arrange
      const { recordSuccessUseCase } = createTestContext();

      // Act & Assert
      await expect(
        recordSuccessUseCase.execute({
          tenantId: TENANT_ID,
          actorUserId: ACTOR_USER_ID,
          routeId: ROUTE_ID,
          stopId: STOP_ID,
          packageId: 'pkg-1',
          files: [],
          requestId: 'req-no-files',
        }),
      ).rejects.toThrow(DeliveryValidationError);
    });

    it('rejects when package is not in OUT_FOR_DELIVERY state', async () => {
      // Arrange
      const { session, recordSuccessUseCase } = createTestContext();
      const stop = createStopFixture(1);
      const route = createRouteFixture([stop]);
      const pkg = createPackageFixture('pkg-1', 'IN_TRANSIT'); // No atendido aún

      session.routes.set(route.id, route);
      session.stops.set(stop.id, stop);
      session.packages.set(pkg.id, pkg);
      session.stopPackages.set(stop.id, [pkg.id]);
      session.assignments.set('assign-1', {
        packageId: pkg.id,
        routeId: route.id,
        status: 'ACTIVE',
      });

      // Act & Assert
      await expect(
        recordSuccessUseCase.execute({
          tenantId: TENANT_ID,
          actorUserId: ACTOR_USER_ID,
          routeId: route.id,
          stopId: stop.id,
          packageId: pkg.id,
          files: [
            {
              buffer: Buffer.from('photo'),
              type: 'PHOTO',
              mimeType: 'image/jpeg',
            },
          ],
          requestId: 'req-invalid-state',
        }),
      ).rejects.toThrow(DeliveryStateConflictError);
    });
  });

  describe('RecordFailedDeliveryUseCase', () => {
    it('records a failed delivery, retains active assignment, and resolves stop to FAILED when all packages resolved', async () => {
      // Arrange
      const { session, recordFailedUseCase } = createTestContext();
      const stop = createStopFixture(1);
      const route = createRouteFixture([stop]);
      const pkg = createPackageFixture('pkg-1', 'OUT_FOR_DELIVERY');

      session.routes.set(route.id, route);
      session.stops.set(stop.id, stop);
      session.packages.set(pkg.id, pkg);
      session.stopPackages.set(stop.id, [pkg.id]);
      session.assignments.set('assign-1', {
        packageId: pkg.id,
        routeId: route.id,
        status: 'ACTIVE',
      });

      // Act
      const result = await recordFailedUseCase.execute({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        routeId: route.id,
        stopId: stop.id,
        packageId: pkg.id,
        reasonCode: DeliveryFailureReason.RECIPIENT_ABSENT,
        notes: 'Doorbell rang twice, no response',
        requestId: 'req-failed-1',
      });

      // Assert
      expect(result.outcome).toBe('FAILED');
      expect(result.stopResolution).toBe('FAILED');
      expect(pkg.state).toBe('DELIVERY_FAILED');
      // La custodia física se mantiene en vehículo: la asignación sigue ACTIVE
      expect(session.assignments.get('assign-1')?.status).toBe('ACTIVE');
      expect(session.attempts).toHaveLength(1);
      expect(session.attempts[0]?.reasonCode).toBe(
        DeliveryFailureReason.RECIPIENT_ABSENT,
      );
      expect(session.outbox.some((e) => e.eventType === 'DeliveryFailed')).toBe(
        true,
      );
      expect(
        session.outbox.some((e) => e.eventType === 'DeliveryAttempted'),
      ).toBe(true);
    });

    it('rejects when reasonCode "OTHER" is provided without notes', async () => {
      // Arrange
      const { recordFailedUseCase } = createTestContext();

      // Act & Assert
      await expect(
        recordFailedUseCase.execute({
          tenantId: TENANT_ID,
          actorUserId: ACTOR_USER_ID,
          routeId: ROUTE_ID,
          stopId: STOP_ID,
          packageId: 'pkg-1',
          reasonCode: DeliveryFailureReason.OTHER,
          notes: '   ',
          requestId: 'req-fail-no-notes',
        }),
      ).rejects.toThrow(DeliveryValidationError);
    });

    it('replays identical result when the same failure requestId is resubmitted', async () => {
      // Arrange
      const { session, recordFailedUseCase } = createTestContext();
      const stop = createStopFixture(1);
      const route = createRouteFixture([stop]);
      const pkg = createPackageFixture('pkg-1', 'OUT_FOR_DELIVERY');

      session.routes.set(route.id, route);
      session.stops.set(stop.id, stop);
      session.packages.set(pkg.id, pkg);
      session.stopPackages.set(stop.id, [pkg.id]);
      session.assignments.set('assign-1', {
        packageId: pkg.id,
        routeId: route.id,
        status: 'ACTIVE',
      });

      const command = {
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        routeId: route.id,
        stopId: stop.id,
        packageId: pkg.id,
        reasonCode: DeliveryFailureReason.ACCESS_RESTRICTED,
        requestId: 'req-fail-replay',
      };

      // Act
      const first = await recordFailedUseCase.execute(command);
      const replay = await recordFailedUseCase.execute(command);

      // Assert
      expect(first.replayed).toBe(false);
      expect(replay.replayed).toBe(true);
      expect(replay.attemptId).toBe(first.attemptId);
      expect(replay.outcome).toBe('FAILED');
      expect(session.outbox).toHaveLength(2); // No new outbox events on replay
    });
  });
});
