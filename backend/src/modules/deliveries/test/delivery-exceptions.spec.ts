import { PackageAggregate } from '../../packages/domain/package.aggregate';
import { Route } from '../../routes/domain/route';
import { RouteState } from '../../routes/domain/route-state';
import { RouteStop } from '../../routes/domain/route-stop';
import { RouteStopState } from '../../routes/domain/route-stop-state';
import { RescheduleDeliveryUseCase } from '../application/use-cases/reschedule-delivery.use-case';
import { RequestPackageReturnUseCase } from '../application/use-cases/request-package-return.use-case';
import { ReturnPackageToDepotUseCase } from '../application/use-cases/return-package-to-depot.use-case';
import { ReportIncidentUseCase } from '../application/use-cases/report-incident.use-case';
import { GetDeliveryManifestUseCase } from '../application/use-cases/get-delivery-manifest.use-case';
import {
  DeliveryForbiddenError,
  DeliveryNotFoundError,
  DeliveryStateConflictError,
  DeliveryValidationError,
  IdempotencyConflictError,
} from '../domain/delivery-errors';
import type { DeliveryAttemptRecord } from '../application/ports/delivery-unit-of-work';
import {
  FakeDeliveryAccessPort,
  FakeDeliveryUnitOfWork,
} from './fixtures/delivery-unit-of-work.fake';

// --- Fixtures & Context Helpers ---

const TENANT_ID = 'tenant-1';
const ACTOR_USER_ID = 'user-coordinator-1';
const ROUTE_ID = 'route-1';
const STOP_ID = 'stop-1';
const COURIER_ID = 'courier-1';
const DEPOT_ID = 'depot-central-1';

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
    | 'DELIVERED'
    | 'DELIVERY_FAILED'
    | 'RESCHEDULED'
    | 'RETURN_PENDING'
    | 'RETURNED'
    | 'REGISTERED' = 'DELIVERY_FAILED',
): PackageAggregate {
  return PackageAggregate.reconstitute({
    id,
    tenantId: TENANT_ID,
    state,
  });
}

function createFailedAttemptFixture(
  id: string,
  packageId: string,
  attemptNumber = 1,
): DeliveryAttemptRecord {
  return {
    id,
    tenantId: TENANT_ID,
    packageId,
    routeStopId: STOP_ID,
    courierId: COURIER_ID,
    assignmentId: 'assign-1',
    attemptNumber,
    outcome: 'FAILED',
    reasonCode: 'RECIPIENT_ABSENT',
    notes: 'Nobody at the door',
    attemptedAt: new Date('2026-10-06T10:00:00.000Z'),
  };
}

function createTestContext() {
  const uow = new FakeDeliveryUnitOfWork();
  const accessPort = new FakeDeliveryAccessPort();

  const rescheduleUseCase = new RescheduleDeliveryUseCase(uow, accessPort);
  const requestReturnUseCase = new RequestPackageReturnUseCase(uow, accessPort);
  const returnToDepotUseCase = new ReturnPackageToDepotUseCase(uow, accessPort);
  const reportIncidentUseCase = new ReportIncidentUseCase(uow, accessPort);
  const getManifestUseCase = new GetDeliveryManifestUseCase(uow, accessPort);

  return {
    uow,
    session: uow.session,
    accessPort,
    rescheduleUseCase,
    requestReturnUseCase,
    returnToDepotUseCase,
    reportIncidentUseCase,
    getManifestUseCase,
  };
}

describe('Delivery Exceptions and Manifest Queries', () => {
  describe('RescheduleDeliveryUseCase', () => {
    it('reschedules a failed package and saves the agreed delivery window', async () => {
      // Arrange
      const { session, rescheduleUseCase } = createTestContext();
      const pkg = createPackageFixture('pkg-1', 'DELIVERY_FAILED');
      const failedAttempt = createFailedAttemptFixture('att-fail-1', pkg.id, 1);
      const startAt = new Date('2026-10-07T09:00:00.000Z');
      const endAt = new Date('2026-10-07T13:00:00.000Z');

      session.packages.set(pkg.id, pkg);
      session.attempts.push(failedAttempt);
      session.assignments.set('assign-1', {
        packageId: pkg.id,
        routeId: ROUTE_ID,
        status: 'ACTIVE',
      });

      // Act
      const result = await rescheduleUseCase.execute({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        packageId: pkg.id,
        failedAttemptId: failedAttempt.id,
        startAt,
        endAt,
        reasonCode: 'RECIPIENT_REQUESTED',
        requestId: 'req-reschedule-1',
      });

      // Assert
      expect(result.packageId).toBe(pkg.id);
      expect(result.newStatus).toBe('RESCHEDULED');
      expect(result.replayed).toBe(false);
      expect(pkg.state).toBe('RESCHEDULED');
      expect(session.windows).toHaveLength(1);
      expect(session.windows[0]?.packageId).toBe(pkg.id);
      expect(session.windows[0]?.startAt).toEqual(startAt);
      expect(session.windows[0]?.endAt).toEqual(endAt);
      expect(session.outbox).toHaveLength(1);
      expect(session.outbox[0]?.eventType).toBe('PackageRescheduled');
      expect(session.assignments.get('assign-1')?.status).toBe('ACTIVE');
    });

    it('replays previously recorded rescheduling when idempotency requestId matches', async () => {
      // Arrange
      const { session, rescheduleUseCase } = createTestContext();
      const pkg = createPackageFixture('pkg-1', 'DELIVERY_FAILED');
      const failedAttempt = createFailedAttemptFixture('att-fail-1', pkg.id, 1);
      const startAt = new Date('2026-10-07T09:00:00.000Z');
      const endAt = new Date('2026-10-07T13:00:00.000Z');

      session.packages.set(pkg.id, pkg);
      session.attempts.push(failedAttempt);

      const command = {
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        packageId: pkg.id,
        failedAttemptId: failedAttempt.id,
        startAt,
        endAt,
        reasonCode: 'RECIPIENT_REQUESTED',
        requestId: 'req-reschedule-replay',
      };

      await rescheduleUseCase.execute(command);

      // Act
      const replayedResult = await rescheduleUseCase.execute(command);

      // Assert
      expect(replayedResult.replayed).toBe(true);
      expect(replayedResult.packageId).toBe(pkg.id);
      expect(replayedResult.newStatus).toBe('RESCHEDULED');
      expect(session.windows).toHaveLength(1);
      expect(session.outbox).toHaveLength(1);
    });

    it('rejects duplicate requestId when targeting a different package', async () => {
      // Arrange
      const { session, rescheduleUseCase } = createTestContext();
      const pkg1 = createPackageFixture('pkg-1', 'DELIVERY_FAILED');
      const failedAttempt1 = createFailedAttemptFixture(
        'att-fail-1',
        pkg1.id,
        1,
      );
      const startAt = new Date('2026-10-07T09:00:00.000Z');
      const endAt = new Date('2026-10-07T13:00:00.000Z');

      session.packages.set(pkg1.id, pkg1);
      session.attempts.push(failedAttempt1);

      await rescheduleUseCase.execute({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        packageId: pkg1.id,
        failedAttemptId: failedAttempt1.id,
        startAt,
        endAt,
        reasonCode: 'RECIPIENT_REQUESTED',
        requestId: 'req-reschedule-conflict',
      });

      // Act
      const executeConflicting = rescheduleUseCase.execute({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        packageId: 'pkg-different',
        failedAttemptId: failedAttempt1.id,
        startAt,
        endAt,
        reasonCode: 'RECIPIENT_REQUESTED',
        requestId: 'req-reschedule-conflict',
      });

      // Assert
      await expect(executeConflicting).rejects.toThrow(
        IdempotencyConflictError,
      );
    });

    it('rejects rescheduling when startAt is not earlier than endAt', async () => {
      // Arrange
      const { rescheduleUseCase } = createTestContext();
      const startAt = new Date('2026-10-07T14:00:00.000Z');
      const endAt = new Date('2026-10-07T09:00:00.000Z');

      // Act
      const executeInvalidWindow = rescheduleUseCase.execute({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        packageId: 'pkg-1',
        failedAttemptId: 'att-1',
        startAt,
        endAt,
        reasonCode: 'RECIPIENT_REQUESTED',
        requestId: 'req-invalid-window',
      });

      // Assert
      await expect(executeInvalidWindow).rejects.toThrow(
        DeliveryValidationError,
      );
    });

    it('rejects rescheduling when actor lacks reschedule permission', async () => {
      // Arrange
      const { accessPort, rescheduleUseCase } = createTestContext();
      accessPort.allowReschedule = false;

      // Act
      const executeForbidden = rescheduleUseCase.execute({
        tenantId: TENANT_ID,
        actorUserId: 'unauthorized-user',
        packageId: 'pkg-1',
        failedAttemptId: 'att-1',
        startAt: new Date('2026-10-07T09:00:00.000Z'),
        endAt: new Date('2026-10-07T13:00:00.000Z'),
        reasonCode: 'RECIPIENT_REQUESTED',
        requestId: 'req-forbidden',
      });

      // Assert
      await expect(executeForbidden).rejects.toThrow(DeliveryForbiddenError);
    });

    it('rejects rescheduling when package does not exist or belongs to another tenant', async () => {
      // Arrange
      const { rescheduleUseCase } = createTestContext();

      // Act
      const executeMissingPackage = rescheduleUseCase.execute({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        packageId: 'pkg-nonexistent',
        failedAttemptId: 'att-1',
        startAt: new Date('2026-10-07T09:00:00.000Z'),
        endAt: new Date('2026-10-07T13:00:00.000Z'),
        reasonCode: 'RECIPIENT_REQUESTED',
        requestId: 'req-not-found',
      });

      // Assert
      await expect(executeMissingPackage).rejects.toThrow(
        DeliveryNotFoundError,
      );
    });

    it('rejects rescheduling when package is not in DELIVERY_FAILED state', async () => {
      // Arrange
      const { session, rescheduleUseCase } = createTestContext();
      const pkg = createPackageFixture('pkg-1', 'OUT_FOR_DELIVERY');
      session.packages.set(pkg.id, pkg);

      // Act
      const executeInvalidState = rescheduleUseCase.execute({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        packageId: pkg.id,
        failedAttemptId: 'att-1',
        startAt: new Date('2026-10-07T09:00:00.000Z'),
        endAt: new Date('2026-10-07T13:00:00.000Z'),
        reasonCode: 'RECIPIENT_REQUESTED',
        requestId: 'req-conflict-state',
      });

      // Assert
      await expect(executeInvalidState).rejects.toThrow(
        DeliveryStateConflictError,
      );
    });

    it('rejects rescheduling when failedAttemptId does not match the latest failed attempt', async () => {
      // Arrange
      const { session, rescheduleUseCase } = createTestContext();
      const pkg = createPackageFixture('pkg-1', 'DELIVERY_FAILED');
      const latestAttempt = createFailedAttemptFixture(
        'att-fail-latest',
        pkg.id,
        2,
      );

      session.packages.set(pkg.id, pkg);
      session.attempts.push(latestAttempt);

      // Act
      const executeMismatchedAttempt = rescheduleUseCase.execute({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        packageId: pkg.id,
        failedAttemptId: 'att-fail-stale',
        startAt: new Date('2026-10-07T09:00:00.000Z'),
        endAt: new Date('2026-10-07T13:00:00.000Z'),
        reasonCode: 'RECIPIENT_REQUESTED',
        requestId: 'req-mismatch-attempt',
      });

      // Assert
      await expect(executeMismatchedAttempt).rejects.toThrow(
        DeliveryValidationError,
      );
    });
  });

  describe('RequestPackageReturnUseCase', () => {
    it('requests a package return for a failed delivery', async () => {
      // Arrange
      const { session, requestReturnUseCase } = createTestContext();
      const pkg = createPackageFixture('pkg-1', 'DELIVERY_FAILED');
      const failedAttempt = createFailedAttemptFixture('att-fail-1', pkg.id, 1);

      session.packages.set(pkg.id, pkg);
      session.attempts.push(failedAttempt);
      session.assignments.set('assign-1', {
        packageId: pkg.id,
        routeId: ROUTE_ID,
        status: 'ACTIVE',
      });

      // Act
      const result = await requestReturnUseCase.execute({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        packageId: pkg.id,
        failedAttemptId: failedAttempt.id,
        reasonCode: 'MAX_ATTEMPTS_EXCEEDED',
        requestId: 'req-return-1',
      });

      // Assert
      expect(result.packageId).toBe(pkg.id);
      expect(result.newStatus).toBe('RETURN_PENDING');
      expect(result.reasonCode).toBe('MAX_ATTEMPTS_EXCEEDED');
      expect(result.replayed).toBe(false);
      expect(pkg.state).toBe('RETURN_PENDING');
      expect(session.outbox).toHaveLength(1);
      expect(session.outbox[0]?.eventType).toBe('PackageReturnPending');
      expect(session.assignments.get('assign-1')?.status).toBe('ACTIVE');
    });

    it('replays return request when duplicate requestId is provided', async () => {
      // Arrange
      const { session, requestReturnUseCase } = createTestContext();
      const pkg = createPackageFixture('pkg-1', 'DELIVERY_FAILED');
      const failedAttempt = createFailedAttemptFixture('att-fail-1', pkg.id, 1);

      session.packages.set(pkg.id, pkg);
      session.attempts.push(failedAttempt);

      const command = {
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        packageId: pkg.id,
        failedAttemptId: failedAttempt.id,
        reasonCode: 'MAX_ATTEMPTS_EXCEEDED',
        requestId: 'req-return-replay',
      };

      await requestReturnUseCase.execute(command);

      // Act
      const replayedResult = await requestReturnUseCase.execute(command);

      // Assert
      expect(replayedResult.replayed).toBe(true);
      expect(replayedResult.newStatus).toBe('RETURN_PENDING');
      expect(session.outbox).toHaveLength(1);
    });

    it('rejects duplicate requestId when targeting a different package', async () => {
      // Arrange
      const { session, requestReturnUseCase } = createTestContext();
      const pkg1 = createPackageFixture('pkg-1', 'DELIVERY_FAILED');
      const failedAttempt1 = createFailedAttemptFixture(
        'att-fail-1',
        pkg1.id,
        1,
      );

      session.packages.set(pkg1.id, pkg1);
      session.attempts.push(failedAttempt1);

      await requestReturnUseCase.execute({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        packageId: pkg1.id,
        failedAttemptId: failedAttempt1.id,
        reasonCode: 'MAX_ATTEMPTS_EXCEEDED',
        requestId: 'req-return-conflict',
      });

      // Act
      const executeConflicting = requestReturnUseCase.execute({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        packageId: 'pkg-different',
        failedAttemptId: failedAttempt1.id,
        reasonCode: 'MAX_ATTEMPTS_EXCEEDED',
        requestId: 'req-return-conflict',
      });

      // Assert
      await expect(executeConflicting).rejects.toThrow(
        IdempotencyConflictError,
      );
    });

    it('rejects return request when reasonCode is empty', async () => {
      // Arrange
      const { requestReturnUseCase } = createTestContext();

      // Act
      const executeEmptyReason = requestReturnUseCase.execute({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        packageId: 'pkg-1',
        failedAttemptId: 'att-1',
        reasonCode: '   ',
        requestId: 'req-empty-reason',
      });

      // Assert
      await expect(executeEmptyReason).rejects.toThrow(DeliveryValidationError);
    });

    it('rejects return request when actor lacks request return permission', async () => {
      // Arrange
      const { accessPort, requestReturnUseCase } = createTestContext();
      accessPort.allowRequestReturn = false;

      // Act
      const executeForbidden = requestReturnUseCase.execute({
        tenantId: TENANT_ID,
        actorUserId: 'unauthorized-user',
        packageId: 'pkg-1',
        failedAttemptId: 'att-1',
        reasonCode: 'RECIPIENT_REJECTED',
        requestId: 'req-forbidden-return',
      });

      // Assert
      await expect(executeForbidden).rejects.toThrow(DeliveryForbiddenError);
    });

    it('rejects return request when package is not in DELIVERY_FAILED state', async () => {
      // Arrange
      const { session, requestReturnUseCase } = createTestContext();
      const pkg = createPackageFixture('pkg-1', 'REGISTERED');
      session.packages.set(pkg.id, pkg);

      // Act
      const executeInvalidState = requestReturnUseCase.execute({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        packageId: pkg.id,
        failedAttemptId: 'att-1',
        reasonCode: 'RECIPIENT_REJECTED',
        requestId: 'req-invalid-state-return',
      });

      // Assert
      await expect(executeInvalidState).rejects.toThrow(
        DeliveryStateConflictError,
      );
    });

    it('rejects return request when failedAttemptId does not match the latest failed attempt', async () => {
      // Arrange
      const { session, requestReturnUseCase } = createTestContext();
      const pkg = createPackageFixture('pkg-1', 'DELIVERY_FAILED');
      const latestAttempt = createFailedAttemptFixture(
        'att-fail-actual',
        pkg.id,
        1,
      );

      session.packages.set(pkg.id, pkg);
      session.attempts.push(latestAttempt);

      // Act
      const executeMismatched = requestReturnUseCase.execute({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        packageId: pkg.id,
        failedAttemptId: 'att-fail-stale',
        reasonCode: 'RECIPIENT_REJECTED',
        requestId: 'req-mismatch-return',
      });

      // Assert
      await expect(executeMismatched).rejects.toThrow(DeliveryValidationError);
    });
  });

  describe('ReturnPackageToDepotUseCase', () => {
    it('receives a RETURN_PENDING package at the depot and ends its active assignment', async () => {
      // Arrange
      const { session, returnToDepotUseCase } = createTestContext();
      const pkg = createPackageFixture('pkg-1', 'RETURN_PENDING');

      session.packages.set(pkg.id, pkg);
      session.assignments.set('assign-1', {
        packageId: pkg.id,
        routeId: ROUTE_ID,
        status: 'ACTIVE',
      });

      // Act
      const result = await returnToDepotUseCase.execute({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        packageId: pkg.id,
        routeId: ROUTE_ID,
        depotId: DEPOT_ID,
        physicalReceiptConfirmed: true,
        requestId: 'req-depot-receive-1',
      });

      // Assert
      expect(result.packageId).toBe(pkg.id);
      expect(result.status).toBe('RETURNED');
      expect(result.assignmentEnded).toBe(true);
      expect(result.depotId).toBe(DEPOT_ID);
      expect(result.replayed).toBe(false);
      expect(pkg.state).toBe('RETURNED');
      expect(session.assignments.get('assign-1')?.status).toBe('ENDED');
      expect(session.outbox).toHaveLength(1);
      expect(session.outbox[0]?.eventType).toBe('PackageReturned');
    });

    it('receives a RESCHEDULED package at the depot, ending assignment while keeping RESCHEDULED state', async () => {
      // Arrange
      const { session, returnToDepotUseCase } = createTestContext();
      const pkg = createPackageFixture('pkg-rescheduled', 'RESCHEDULED');

      session.packages.set(pkg.id, pkg);
      session.assignments.set('assign-rescheduled', {
        packageId: pkg.id,
        routeId: ROUTE_ID,
        status: 'ACTIVE',
      });

      // Act
      const result = await returnToDepotUseCase.execute({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        packageId: pkg.id,
        routeId: ROUTE_ID,
        depotId: DEPOT_ID,
        physicalReceiptConfirmed: true,
        requestId: 'req-depot-rescheduled-1',
      });

      // Assert
      expect(result.packageId).toBe(pkg.id);
      expect(result.status).toBe('RESCHEDULED');
      expect(result.assignmentEnded).toBe(true);
      expect(pkg.state).toBe('RESCHEDULED');
      expect(session.assignments.get('assign-rescheduled')?.status).toBe(
        'ENDED',
      );
      expect(session.outbox).toHaveLength(1);
      expect(session.outbox[0]?.eventType).toBe('PackageReceivedAtDepot');
    });

    it('replays depot reception when duplicate requestId is provided', async () => {
      // Arrange
      const { session, returnToDepotUseCase } = createTestContext();
      const pkg = createPackageFixture('pkg-1', 'RETURN_PENDING');

      session.packages.set(pkg.id, pkg);
      session.assignments.set('assign-1', {
        packageId: pkg.id,
        routeId: ROUTE_ID,
        status: 'ACTIVE',
      });

      const command = {
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        packageId: pkg.id,
        routeId: ROUTE_ID,
        depotId: DEPOT_ID,
        physicalReceiptConfirmed: true,
        requestId: 'req-depot-replay',
      };

      await returnToDepotUseCase.execute(command);

      // Act
      const replayedResult = await returnToDepotUseCase.execute(command);

      // Assert
      expect(replayedResult.replayed).toBe(true);
      expect(replayedResult.status).toBe('RETURNED');
      expect(session.outbox).toHaveLength(1);
    });

    it('rejects duplicate requestId when targeting a different package', async () => {
      // Arrange
      const { session, returnToDepotUseCase } = createTestContext();
      const pkg1 = createPackageFixture('pkg-1', 'RETURN_PENDING');

      session.packages.set(pkg1.id, pkg1);
      session.assignments.set('assign-1', {
        packageId: pkg1.id,
        routeId: ROUTE_ID,
        status: 'ACTIVE',
      });

      await returnToDepotUseCase.execute({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        packageId: pkg1.id,
        routeId: ROUTE_ID,
        depotId: DEPOT_ID,
        physicalReceiptConfirmed: true,
        requestId: 'req-depot-conflict',
      });

      // Act
      const executeConflicting = returnToDepotUseCase.execute({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        packageId: 'pkg-different',
        routeId: ROUTE_ID,
        depotId: DEPOT_ID,
        physicalReceiptConfirmed: true,
        requestId: 'req-depot-conflict',
      });

      // Assert
      await expect(executeConflicting).rejects.toThrow(
        IdempotencyConflictError,
      );
    });

    it('rejects depot reception when physical receipt is not confirmed', async () => {
      // Arrange
      const { returnToDepotUseCase } = createTestContext();

      // Act
      const executeUnconfirmed = returnToDepotUseCase.execute({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        packageId: 'pkg-1',
        routeId: ROUTE_ID,
        depotId: DEPOT_ID,
        physicalReceiptConfirmed: false,
        requestId: 'req-unconfirmed',
      });

      // Assert
      await expect(executeUnconfirmed).rejects.toThrow(DeliveryValidationError);
    });

    it('rejects depot reception when depotId is empty', async () => {
      // Arrange
      const { returnToDepotUseCase } = createTestContext();

      // Act
      const executeEmptyDepot = returnToDepotUseCase.execute({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        packageId: 'pkg-1',
        routeId: ROUTE_ID,
        depotId: '   ',
        physicalReceiptConfirmed: true,
        requestId: 'req-empty-depot',
      });

      // Assert
      await expect(executeEmptyDepot).rejects.toThrow(DeliveryValidationError);
    });

    it('rejects depot reception when actor lacks depot reception permission', async () => {
      // Arrange
      const { accessPort, returnToDepotUseCase } = createTestContext();
      accessPort.allowReceive = false;

      // Act
      const executeForbidden = returnToDepotUseCase.execute({
        tenantId: TENANT_ID,
        actorUserId: 'unauthorized-user',
        packageId: 'pkg-1',
        routeId: ROUTE_ID,
        depotId: DEPOT_ID,
        physicalReceiptConfirmed: true,
        requestId: 'req-forbidden-depot',
      });

      // Assert
      await expect(executeForbidden).rejects.toThrow(DeliveryForbiddenError);
    });

    it('rejects depot reception when package is in an incompatible state', async () => {
      // Arrange
      const { session, returnToDepotUseCase } = createTestContext();
      const pkg = createPackageFixture('pkg-1', 'OUT_FOR_DELIVERY');
      session.packages.set(pkg.id, pkg);

      // Act
      const executeIncompatible = returnToDepotUseCase.execute({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        packageId: pkg.id,
        routeId: ROUTE_ID,
        depotId: DEPOT_ID,
        physicalReceiptConfirmed: true,
        requestId: 'req-incompatible-state',
      });

      // Assert
      await expect(executeIncompatible).rejects.toThrow(
        DeliveryStateConflictError,
      );
    });
  });

  describe('ReportIncidentUseCase', () => {
    it('reports an operational incident targeting a route, stop, or package', async () => {
      // Arrange
      const { session, reportIncidentUseCase } = createTestContext();

      // Act
      const result = await reportIncidentUseCase.execute({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        routeId: ROUTE_ID,
        routeStopId: STOP_ID,
        packageId: null,
        type: 'VEHICLE_BREAKDOWN',
        description: 'Flat tire near stop 1',
        requestId: 'req-incident-1',
      });

      // Assert
      expect(result.incidentId).toBeDefined();
      expect(result.status).toBe('OPEN');
      expect(result.type).toBe('VEHICLE_BREAKDOWN');
      expect(result.replayed).toBe(false);
      expect(session.incidents).toHaveLength(1);
      expect(session.incidents[0]?.routeId).toBe(ROUTE_ID);
      expect(session.incidents[0]?.routeStopId).toBe(STOP_ID);
      expect(session.incidents[0]?.status).toBe('OPEN');
      expect(session.outbox).toHaveLength(1);
      expect(session.outbox[0]?.eventType).toBe('IncidentReported');
    });

    it('replays incident report when duplicate requestId is provided', async () => {
      // Arrange
      const { session, reportIncidentUseCase } = createTestContext();
      const command = {
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        routeId: ROUTE_ID,
        routeStopId: null,
        packageId: null,
        type: 'WEATHER_DELAY',
        description: 'Heavy rain blocking avenue',
        requestId: 'req-incident-replay',
      };

      await reportIncidentUseCase.execute(command);

      // Act
      const replayedResult = await reportIncidentUseCase.execute(command);

      // Assert
      expect(replayedResult.replayed).toBe(true);
      expect(session.incidents).toHaveLength(1);
      expect(session.outbox).toHaveLength(1);
    });

    it('rejects incident report when no target identifier is provided', async () => {
      // Arrange
      const { reportIncidentUseCase } = createTestContext();

      // Act
      const executeNoTarget = reportIncidentUseCase.execute({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        routeId: null,
        routeStopId: null,
        packageId: null,
        type: 'GENERAL_INCIDENT',
        description: 'Something happened without target',
        requestId: 'req-no-target',
      });

      // Assert
      await expect(executeNoTarget).rejects.toThrow(DeliveryValidationError);
    });

    it('rejects incident report when description is empty or exceeds 2000 characters', async () => {
      // Arrange
      const { reportIncidentUseCase } = createTestContext();

      // Act
      const executeEmptyDesc = reportIncidentUseCase.execute({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        routeId: ROUTE_ID,
        type: 'GENERAL_INCIDENT',
        description: '   ',
        requestId: 'req-empty-desc',
      });
      const executeTooLongDesc = reportIncidentUseCase.execute({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        routeId: ROUTE_ID,
        type: 'GENERAL_INCIDENT',
        description: 'A'.repeat(2001),
        requestId: 'req-long-desc',
      });

      // Assert
      await expect(executeEmptyDesc).rejects.toThrow(DeliveryValidationError);
      await expect(executeTooLongDesc).rejects.toThrow(DeliveryValidationError);
    });

    it('rejects incident report when actor lacks report incident permission', async () => {
      // Arrange
      const { accessPort, reportIncidentUseCase } = createTestContext();
      accessPort.allowReportIncident = false;

      // Act
      const executeForbidden = reportIncidentUseCase.execute({
        tenantId: TENANT_ID,
        actorUserId: 'unauthorized-user',
        routeId: ROUTE_ID,
        type: 'GENERAL_INCIDENT',
        description: 'Valid description',
        requestId: 'req-forbidden-incident',
      });

      // Assert
      await expect(executeForbidden).rejects.toThrow(DeliveryForbiddenError);
    });
  });

  describe('GetDeliveryManifestUseCase', () => {
    it('returns all stops in delivery sequence using the Route iterator', async () => {
      const { session, getManifestUseCase } = createTestContext();
      const stop1 = createStopFixture(1, {
        id: 'stop-1',
        state: RouteStopState.COMPLETED,
      });
      const stop2 = createStopFixture(2, {
        id: 'stop-2',
        state: RouteStopState.PENDING,
      });
      const stop3 = createStopFixture(3, {
        id: 'stop-3',
        state: RouteStopState.FAILED,
      });
      const route = createRouteFixture([stop1, stop2, stop3]);

      session.routes.set(route.id, route);
      session.packages.set('pkg-1', createPackageFixture('pkg-1', 'DELIVERED'));
      session.packages.set(
        'pkg-2',
        createPackageFixture('pkg-2', 'OUT_FOR_DELIVERY'),
      );
      session.packages.set(
        'pkg-3',
        createPackageFixture('pkg-3', 'IN_TRANSIT'),
      );
      session.packages.set(
        'pkg-4',
        createPackageFixture('pkg-4', 'DELIVERY_FAILED'),
      );

      session.assignments.set('assign-1', {
        packageId: 'pkg-1',
        routeId: route.id,
        routeStopId: 'stop-1',
        status: 'ENDED',
        routeOutcome: 'DELIVERED',
        receivedAtDepotId: null,
        trackingCode: 'TRK-001',
      });
      session.assignments.set('assign-2', {
        packageId: 'pkg-2',
        routeId: route.id,
        routeStopId: 'stop-2',
        status: 'ACTIVE',
        routeOutcome: null,
        receivedAtDepotId: null,
        trackingCode: 'TRK-002',
      });
      session.assignments.set('assign-3', {
        packageId: 'pkg-3',
        routeId: route.id,
        routeStopId: 'stop-2',
        status: 'ACTIVE',
        routeOutcome: null,
        receivedAtDepotId: null,
        trackingCode: 'TRK-003',
      });
      session.assignments.set('assign-4', {
        packageId: 'pkg-4',
        routeId: route.id,
        routeStopId: 'stop-3',
        status: 'ENDED',
        routeOutcome: 'FAILED',
        receivedAtDepotId: 'depot-1',
        trackingCode: 'TRK-004',
      });

      const result = await getManifestUseCase.execute({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        routeId: route.id,
        view: 'all',
      });

      expect(result.routeId).toBe(route.id);
      expect(result.routeState).toBe(RouteState.IN_PROGRESS);
      expect(result.view).toBe('all');
      expect(result.stops).toHaveLength(3);
      expect(result.stops[0]?.stopId).toBe('stop-1');
      expect(result.stops[0]?.packageIds).toEqual(['pkg-1']);
      expect(result.stops[0]?.packages).toHaveLength(1);
      expect(result.stops[0]?.packages[0]).toEqual({
        assignmentId: 'assign-1',
        packageId: 'pkg-1',
        trackingCode: 'TRK-001',
        state: 'DELIVERED',
        assignmentState: 'ENDED',
        outcome: 'DELIVERED',
        receiptConfirmed: false,
      });
      expect(result.stops[1]?.stopId).toBe('stop-2');
      expect(result.stops[1]?.packageIds).toEqual(['pkg-2', 'pkg-3']);
      expect(result.stops[1]?.packages).toHaveLength(2);
      expect(result.stops[2]?.stopId).toBe('stop-3');
      expect(result.stops[2]?.packageIds).toEqual(['pkg-4']);
      expect(result.stops[2]?.packages[0]?.receiptConfirmed).toBe(true);
    });

    it('isolates stop manifests when the same package has assignments in two different stops', async () => {
      const { session, getManifestUseCase } = createTestContext();
      const stop1 = createStopFixture(1, {
        id: 'stop-1',
        state: RouteStopState.FAILED,
      });
      const stop2 = createStopFixture(2, {
        id: 'stop-2',
        state: RouteStopState.PENDING,
      });
      const route = createRouteFixture([stop1, stop2]);

      session.routes.set(route.id, route);
      session.packages.set(
        'pkg-shared',
        createPackageFixture('pkg-shared', 'OUT_FOR_DELIVERY'),
      );
      session.stopPackages.set('stop-1', ['pkg-shared']);
      session.stopPackages.set('stop-2', ['pkg-shared']);

      session.assignments.set('assign-stop-1-ended', {
        packageId: 'pkg-shared',
        routeId: route.id,
        routeStopId: 'stop-1',
        status: 'ENDED',
        routeOutcome: 'FAILED',
        receivedAtDepotId: null,
        trackingCode: 'TRK-SHARED-1',
      });
      session.assignments.set('assign-stop-2-active', {
        packageId: 'pkg-shared',
        routeId: route.id,
        routeStopId: 'stop-2',
        status: 'ACTIVE',
        routeOutcome: null,
        receivedAtDepotId: null,
        trackingCode: 'TRK-SHARED-1',
      });

      const result = await getManifestUseCase.execute({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        routeId: route.id,
        view: 'all',
      });

      expect(result.stops[0]?.stopId).toBe('stop-1');
      expect(result.stops[0]?.packages).toHaveLength(1);
      expect(result.stops[0]?.packages[0]?.assignmentId).toBe(
        'assign-stop-1-ended',
      );
      expect(result.stops[0]?.packages[0]?.outcome).toBe('FAILED');

      expect(result.stops[1]?.stopId).toBe('stop-2');
      expect(result.stops[1]?.packages).toHaveLength(1);
      expect(result.stops[1]?.packages[0]?.assignmentId).toBe(
        'assign-stop-2-active',
      );
      expect(result.stops[1]?.packages[0]?.outcome).toBeNull();
    });

    it('returns only pending stops using the Route pending iterator', async () => {
      const { session, getManifestUseCase } = createTestContext();
      const stop1 = createStopFixture(1, {
        id: 'stop-1',
        state: RouteStopState.COMPLETED,
      });
      const stop2 = createStopFixture(2, {
        id: 'stop-2',
        state: RouteStopState.PENDING,
      });
      const stop3 = createStopFixture(3, {
        id: 'stop-3',
        state: RouteStopState.FAILED,
      });
      const route = createRouteFixture([stop1, stop2, stop3]);

      session.routes.set(route.id, route);
      session.packages.set(
        'pkg-2',
        createPackageFixture('pkg-2', 'IN_TRANSIT'),
      );
      session.assignments.set('assign-2', {
        packageId: 'pkg-2',
        routeId: route.id,
        routeStopId: 'stop-2',
        status: 'ACTIVE',
        routeOutcome: null,
        receivedAtDepotId: null,
        trackingCode: 'TRK-002',
      });

      const result = await getManifestUseCase.execute({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        routeId: route.id,
        view: 'pending',
      });

      expect(result.routeState).toBe(RouteState.IN_PROGRESS);
      expect(result.view).toBe('pending');
      expect(result.stops).toHaveLength(1);
      expect(result.stops[0]?.stopId).toBe('stop-2');
      expect(result.stops[0]?.state).toBe('PENDING');
      expect(result.stops[0]?.packageIds).toEqual(['pkg-2']);
      expect(result.stops[0]?.packages[0]?.assignmentId).toBe('assign-2');
    });

    it('returns only failed stops using the Route failed iterator', async () => {
      const { session, getManifestUseCase } = createTestContext();
      const stop1 = createStopFixture(1, {
        id: 'stop-1',
        state: RouteStopState.COMPLETED,
      });
      const stop2 = createStopFixture(2, {
        id: 'stop-2',
        state: RouteStopState.PENDING,
      });
      const stop3 = createStopFixture(3, {
        id: 'stop-3',
        state: RouteStopState.FAILED,
      });
      const route = createRouteFixture([stop1, stop2, stop3]);

      session.routes.set(route.id, route);
      session.packages.set(
        'pkg-4',
        createPackageFixture('pkg-4', 'DELIVERY_FAILED'),
      );
      session.assignments.set('assign-4', {
        packageId: 'pkg-4',
        routeId: route.id,
        routeStopId: 'stop-3',
        status: 'ENDED',
        routeOutcome: 'FAILED',
        receivedAtDepotId: null,
        trackingCode: 'TRK-004',
      });

      const result = await getManifestUseCase.execute({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        routeId: route.id,
        view: 'failed',
      });

      expect(result.routeState).toBe(RouteState.IN_PROGRESS);
      expect(result.view).toBe('failed');
      expect(result.stops).toHaveLength(1);
      expect(result.stops[0]?.stopId).toBe('stop-3');
      expect(result.stops[0]?.state).toBe('FAILED');
      expect(result.stops[0]?.packageIds).toEqual(['pkg-4']);
      expect(result.stops[0]?.packages[0]?.outcome).toBe('FAILED');
    });

    it('rejects query when actor is not authorized to view route delivery manifest', async () => {
      const { session, accessPort, getManifestUseCase } = createTestContext();
      const route = createRouteFixture([]);
      session.routes.set(route.id, route);
      accessPort.allowViewDeliveries = false;

      const executeForbidden = getManifestUseCase.execute({
        tenantId: TENANT_ID,
        actorUserId: 'unauthorized-user',
        routeId: route.id,
        view: 'all',
      });

      await expect(executeForbidden).rejects.toThrow(DeliveryForbiddenError);
    });

    it('rejects query when route belongs to another tenant', async () => {
      const { session, getManifestUseCase } = createTestContext();
      session.routes.set(
        'other-tenant-route',
        new Route({
          id: 'other-tenant-route',
          tenantId: 'different-tenant',
          planningRequestId: 'plan-1',
          vehicleId: 'vehicle-1',
          courierId: COURIER_ID,
          state: RouteState.IN_PROGRESS,
          plannedAt: new Date('2026-10-06T08:00:00.000Z'),
          stops: [],
        }),
      );

      const executeNotFound = getManifestUseCase.execute({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        routeId: 'other-tenant-route',
        view: 'all',
      });

      await expect(executeNotFound).rejects.toThrow(DeliveryNotFoundError);
    });

    it('rejects query when route does not exist', async () => {
      const { getManifestUseCase } = createTestContext();

      const executeNotFound = getManifestUseCase.execute({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        routeId: 'route-nonexistent',
        view: 'all',
      });

      await expect(executeNotFound).rejects.toThrow(DeliveryNotFoundError);
    });

    it('fails when assignment references a missing package in session', async () => {
      const { session, getManifestUseCase } = createTestContext();
      const stop = createStopFixture(1, { id: 'stop-orphan' });
      const route = createRouteFixture([stop]);
      session.routes.set(route.id, route);
      session.assignments.set('assign-orphan', {
        packageId: 'missing-pkg-id',
        routeId: route.id,
        routeStopId: 'stop-orphan',
        status: 'ACTIVE',
        trackingCode: 'TRK-ORPHAN',
      });

      const executeOrphan = getManifestUseCase.execute({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        routeId: route.id,
        view: 'all',
      });

      await expect(executeOrphan).rejects.toThrow(
        "Package 'missing-pkg-id' not found in FakeDeliverySession for assignment 'assign-orphan'",
      );
    });
  });
});
