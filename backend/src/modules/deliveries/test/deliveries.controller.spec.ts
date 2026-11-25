/* eslint-disable @typescript-eslint/unbound-method */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AuthGuard } from '../../auth/presentation/auth.guard';
import { PermissionsGuard } from '../../auth/presentation/permissions.guard';
import { REQUIRED_PERMISSION_KEY } from '../../auth/presentation/require-permission.decorator';
import {
  COORDINATE_ROUTES_PERMISSION,
  DELIVERY_EXECUTION_PERMISSIONS,
  DEPOT_RECEPTION_PERMISSIONS,
  DeliveriesController,
} from '../presentation/deliveries.controller';
import { AttendRouteStopUseCase } from '../application/use-cases/attend-route-stop.use-case';
import { RecordSuccessfulDeliveryUseCase } from '../application/use-cases/record-successful-delivery.use-case';
import { RecordFailedDeliveryUseCase } from '../application/use-cases/record-failed-delivery.use-case';
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
import type { RequestContext } from '../../../shared/presentation/request-context.decorator';

// --- Constants & Fixtures ---

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_USER_ID = 'user-courier-001';
const CORRELATION_ID = '22222222-2222-4222-8222-222222222222';
const ROUTE_ID = '33333333-3333-4333-8333-333333333333';
const STOP_ID = '44444444-4444-4444-8444-444444444444';
const PACKAGE_ID = '55555555-5555-4555-8555-555555555555';
const FAILED_ATTEMPT_ID = '66666666-6666-4666-8666-666666666666';
const DEPOT_ID = 'depot-north-1';

function createRequestContext(
  overrides: Partial<RequestContext> = {},
): RequestContext {
  return {
    tenantId: TENANT_ID,
    actorUserId: ACTOR_USER_ID,
    correlationId: CORRELATION_ID,
    ...overrides,
  };
}

function createTestContext() {
  const attendRouteStopUseCase = {
    execute: jest.fn(),
  } as unknown as jest.Mocked<AttendRouteStopUseCase>;

  const recordSuccessfulDeliveryUseCase = {
    execute: jest.fn(),
  } as unknown as jest.Mocked<RecordSuccessfulDeliveryUseCase>;

  const recordFailedDeliveryUseCase = {
    execute: jest.fn(),
  } as unknown as jest.Mocked<RecordFailedDeliveryUseCase>;

  const rescheduleDeliveryUseCase = {
    execute: jest.fn(),
  } as unknown as jest.Mocked<RescheduleDeliveryUseCase>;

  const requestPackageReturnUseCase = {
    execute: jest.fn(),
  } as unknown as jest.Mocked<RequestPackageReturnUseCase>;

  const returnPackageToDepotUseCase = {
    execute: jest.fn(),
  } as unknown as jest.Mocked<ReturnPackageToDepotUseCase>;

  const reportIncidentUseCase = {
    execute: jest.fn(),
  } as unknown as jest.Mocked<ReportIncidentUseCase>;

  const getDeliveryManifestUseCase = {
    execute: jest.fn(),
  } as unknown as jest.Mocked<GetDeliveryManifestUseCase>;

  const controller = new DeliveriesController(
    attendRouteStopUseCase,
    recordSuccessfulDeliveryUseCase,
    recordFailedDeliveryUseCase,
    rescheduleDeliveryUseCase,
    requestPackageReturnUseCase,
    returnPackageToDepotUseCase,
    reportIncidentUseCase,
    getDeliveryManifestUseCase,
  );

  return {
    controller,
    attendRouteStopUseCase,
    recordSuccessfulDeliveryUseCase,
    recordFailedDeliveryUseCase,
    rescheduleDeliveryUseCase,
    requestPackageReturnUseCase,
    returnPackageToDepotUseCase,
    reportIncidentUseCase,
    getDeliveryManifestUseCase,
  };
}

describe('DeliveriesController', () => {
  it('protects delivery endpoints with AuthGuard and PermissionsGuard', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      DeliveriesController,
    ) as unknown[];

    expect(guards).toEqual([AuthGuard, PermissionsGuard]);
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSION_KEY, DeliveriesController),
    ).toEqual([...DELIVERY_EXECUTION_PERMISSIONS]);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION_KEY,
        DeliveriesController.prototype.rescheduleDelivery,
      ),
    ).toBe(COORDINATE_ROUTES_PERMISSION);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION_KEY,
        DeliveriesController.prototype.requestPackageReturn,
      ),
    ).toBe(COORDINATE_ROUTES_PERMISSION);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION_KEY,
        DeliveriesController.prototype.returnPackageToDepot,
      ),
    ).toEqual([...DEPOT_RECEPTION_PERMISSIONS]);
  });

  describe('attendRouteStop', () => {
    it('executes use case and returns attendance result', async () => {
      // Arrange
      const { controller, attendRouteStopUseCase } = createTestContext();
      const context = createRequestContext();
      const expectedResult = {
        stopId: STOP_ID,
        actualArrivalAt: new Date('2026-10-06T10:00:00.000Z'),
        affectedPackageIds: [PACKAGE_ID],
        replayed: false,
      };
      attendRouteStopUseCase.execute.mockResolvedValue(expectedResult);

      // Act
      const result = await controller.attendRouteStop(
        context,
        ROUTE_ID,
        STOP_ID,
        { 'idempotency-key': 'req-attend-01' },
      );

      // Assert
      expect(result).toBe(expectedResult);
      expect(attendRouteStopUseCase.execute).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        routeId: ROUTE_ID,
        stopId: STOP_ID,
        requestId: 'req-attend-01',
        correlationId: CORRELATION_ID,
      });
    });

    it('rejects invalid routeId or stopId with BadRequestException', async () => {
      // Arrange
      const { controller } = createTestContext();
      const context = createRequestContext();

      // Act & Assert
      await expect(
        controller.attendRouteStop(context, 'not-a-uuid', STOP_ID, {}),
      ).rejects.toThrow(BadRequestException);
      await expect(
        controller.attendRouteStop(context, ROUTE_ID, 'not-a-uuid', {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('maps DeliveryNotFoundError to NotFoundException', async () => {
      // Arrange
      const { controller, attendRouteStopUseCase } = createTestContext();
      const context = createRequestContext();
      attendRouteStopUseCase.execute.mockRejectedValue(
        new DeliveryNotFoundError(STOP_ID, 'RouteStop'),
      );

      // Act & Assert
      await expect(
        controller.attendRouteStop(context, ROUTE_ID, STOP_ID, {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('maps DeliveryForbiddenError to ForbiddenException', async () => {
      // Arrange
      const { controller, attendRouteStopUseCase } = createTestContext();
      const context = createRequestContext();
      attendRouteStopUseCase.execute.mockRejectedValue(
        new DeliveryForbiddenError('Courier not assigned to route'),
      );

      // Act & Assert
      await expect(
        controller.attendRouteStop(context, ROUTE_ID, STOP_ID, {}),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('recordSuccessfulDelivery', () => {
    it('executes use case with uploaded photo and signature and returns 201 result', async () => {
      // Arrange
      const { controller, recordSuccessfulDeliveryUseCase } =
        createTestContext();
      const context = createRequestContext();
      const photoBuffer = Buffer.from('photo-bytes');
      const sigBuffer = Buffer.from('sig-bytes');
      const expectedResult = {
        attemptId: 'att-1',
        attemptNumber: 1,
        outcome: 'DELIVERED' as const,
        packageId: PACKAGE_ID,
        routeStopId: STOP_ID,
        stopResolution: 'COMPLETED' as const,
        evidenceIds: ['evi-1', 'evi-2'],
        replayed: false,
      };
      recordSuccessfulDeliveryUseCase.execute.mockResolvedValue(expectedResult);

      const files = {
        photo: [{ buffer: photoBuffer, mimetype: 'image/jpeg' }],
        signature: [{ buffer: sigBuffer, mimetype: 'image/png' }],
      };

      // Act
      const result = await controller.recordSuccessfulDelivery(
        context,
        ROUTE_ID,
        STOP_ID,
        PACKAGE_ID,
        { 'idempotency-key': 'req-success-01' },
        { notes: 'Received by concierge' },
        files,
      );

      // Assert
      expect(result).toBe(expectedResult);
      expect(recordSuccessfulDeliveryUseCase.execute).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        routeId: ROUTE_ID,
        stopId: STOP_ID,
        packageId: PACKAGE_ID,
        notes: 'Received by concierge',
        files: [
          { type: 'PHOTO', buffer: photoBuffer, mimeType: 'image/jpeg' },
          { type: 'SIGNATURE', buffer: sigBuffer, mimeType: 'image/png' },
        ],
        requestId: 'req-success-01',
        correlationId: CORRELATION_ID,
      });
    });

    it('maps IdempotencyConflictError to ConflictException', async () => {
      // Arrange
      const { controller, recordSuccessfulDeliveryUseCase } =
        createTestContext();
      const context = createRequestContext();
      recordSuccessfulDeliveryUseCase.execute.mockRejectedValue(
        new IdempotencyConflictError('req-duplicate'),
      );

      // Act & Assert
      await expect(
        controller.recordSuccessfulDelivery(
          context,
          ROUTE_ID,
          STOP_ID,
          PACKAGE_ID,
          { 'idempotency-key': 'req-duplicate' },
          {},
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('maps DeliveryStateConflictError to ConflictException', async () => {
      // Arrange
      const { controller, recordSuccessfulDeliveryUseCase } =
        createTestContext();
      const context = createRequestContext();
      recordSuccessfulDeliveryUseCase.execute.mockRejectedValue(
        new DeliveryStateConflictError('Package not in OUT_FOR_DELIVERY state'),
      );

      // Act & Assert
      await expect(
        controller.recordSuccessfulDelivery(
          context,
          ROUTE_ID,
          STOP_ID,
          PACKAGE_ID,
          {},
          {},
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('maps DeliveryValidationError to BadRequestException', async () => {
      // Arrange
      const { controller, recordSuccessfulDeliveryUseCase } =
        createTestContext();
      const context = createRequestContext();
      recordSuccessfulDeliveryUseCase.execute.mockRejectedValue(
        new DeliveryValidationError(
          'At least one evidence is mandatory',
          'evidences',
        ),
      );

      // Act & Assert
      await expect(
        controller.recordSuccessfulDelivery(
          context,
          ROUTE_ID,
          STOP_ID,
          PACKAGE_ID,
          {},
          {},
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('recordFailedDelivery', () => {
    it('executes use case with reasonCode and optional notes and returns 201 result', async () => {
      // Arrange
      const { controller, recordFailedDeliveryUseCase } = createTestContext();
      const context = createRequestContext();
      const expectedResult = {
        attemptId: 'att-fail-1',
        attemptNumber: 1,
        outcome: 'FAILED' as const,
        packageId: PACKAGE_ID,
        routeStopId: STOP_ID,
        reasonCode: 'RECIPIENT_ABSENT',
        stopResolution: 'PENDING' as const,
        replayed: false,
      };
      recordFailedDeliveryUseCase.execute.mockResolvedValue(expectedResult);

      // Act
      const result = await controller.recordFailedDelivery(
        context,
        ROUTE_ID,
        STOP_ID,
        PACKAGE_ID,
        { 'idempotency-key': 'req-fail-01' },
        { reasonCode: 'RECIPIENT_ABSENT', notes: 'Doorbell not working' },
      );

      // Assert
      expect(result).toBe(expectedResult);
      expect(recordFailedDeliveryUseCase.execute).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        routeId: ROUTE_ID,
        stopId: STOP_ID,
        packageId: PACKAGE_ID,
        reasonCode: 'RECIPIENT_ABSENT',
        notes: 'Doorbell not working',
        files: [],
        requestId: 'req-fail-01',
        correlationId: CORRELATION_ID,
      });
    });

    it('rejects missing reasonCode with BadRequestException', async () => {
      // Arrange
      const { controller } = createTestContext();
      const context = createRequestContext();

      // Act & Assert
      await expect(
        controller.recordFailedDelivery(
          context,
          ROUTE_ID,
          STOP_ID,
          PACKAGE_ID,
          {},
          { reasonCode: '   ' },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('rescheduleDelivery', () => {
    it('executes use case with valid window dates and returns 201 result', async () => {
      // Arrange
      const { controller, rescheduleDeliveryUseCase } = createTestContext();
      const context = createRequestContext();
      const startAt = new Date('2026-10-07T09:00:00.000Z');
      const endAt = new Date('2026-10-07T13:00:00.000Z');
      const expectedResult = {
        packageId: PACKAGE_ID,
        windowId: 'win-1',
        newStatus: 'RESCHEDULED' as const,
        startAt,
        endAt,
        replayed: false,
      };
      rescheduleDeliveryUseCase.execute.mockResolvedValue(expectedResult);

      // Act
      const result = await controller.rescheduleDelivery(
        context,
        PACKAGE_ID,
        { 'idempotency-key': 'req-reschedule-01' },
        {
          failedAttemptId: FAILED_ATTEMPT_ID,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          reasonCode: 'CLIENT_REQUESTED',
        },
      );

      // Assert
      expect(result).toBe(expectedResult);
      expect(rescheduleDeliveryUseCase.execute).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        packageId: PACKAGE_ID,
        failedAttemptId: FAILED_ATTEMPT_ID,
        startAt,
        endAt,
        reasonCode: 'CLIENT_REQUESTED',
        requestId: 'req-reschedule-01',
        correlationId: CORRELATION_ID,
      });
    });

    it('rejects invalid startAt or endAt date format with BadRequestException', async () => {
      // Arrange
      const { controller } = createTestContext();
      const context = createRequestContext();

      // Act & Assert
      await expect(
        controller.rescheduleDelivery(
          context,
          PACKAGE_ID,
          {},
          {
            failedAttemptId: FAILED_ATTEMPT_ID,
            startAt: 'invalid-date',
            endAt: '2026-10-07T13:00:00.000Z',
            reasonCode: 'CLIENT_REQUESTED',
          },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('requestPackageReturn', () => {
    it('executes use case with reasonCode and returns 201 result', async () => {
      // Arrange
      const { controller, requestPackageReturnUseCase } = createTestContext();
      const context = createRequestContext();
      const expectedResult = {
        packageId: PACKAGE_ID,
        newStatus: 'RETURN_PENDING' as const,
        reasonCode: 'MAX_ATTEMPTS_EXCEEDED',
        replayed: false,
      };
      requestPackageReturnUseCase.execute.mockResolvedValue(expectedResult);

      // Act
      const result = await controller.requestPackageReturn(
        context,
        PACKAGE_ID,
        { 'idempotency-key': 'req-return-01' },
        {
          failedAttemptId: FAILED_ATTEMPT_ID,
          reasonCode: 'MAX_ATTEMPTS_EXCEEDED',
        },
      );

      // Assert
      expect(result).toBe(expectedResult);
      expect(requestPackageReturnUseCase.execute).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        packageId: PACKAGE_ID,
        failedAttemptId: FAILED_ATTEMPT_ID,
        reasonCode: 'MAX_ATTEMPTS_EXCEEDED',
        requestId: 'req-return-01',
        correlationId: CORRELATION_ID,
      });
    });

    it('rejects missing failedAttemptId with BadRequestException', async () => {
      // Arrange
      const { controller } = createTestContext();
      const context = createRequestContext();

      // Act & Assert
      await expect(
        controller.requestPackageReturn(
          context,
          PACKAGE_ID,
          {},
          {
            failedAttemptId: 'not-a-uuid',
            reasonCode: 'DAMAGED_PACKAGE',
          },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('returnPackageToDepot', () => {
    it('executes use case with depotId and physicalReceiptConfirmed true', async () => {
      // Arrange
      const { controller, returnPackageToDepotUseCase } = createTestContext();
      const context = createRequestContext();
      const expectedResult = {
        packageId: PACKAGE_ID,
        status: 'RETURNED' as const,
        assignmentEnded: true,
        depotId: DEPOT_ID,
        replayed: false,
      };
      returnPackageToDepotUseCase.execute.mockResolvedValue(expectedResult);

      // Act
      const result = await controller.returnPackageToDepot(
        context,
        PACKAGE_ID,
        { 'idempotency-key': 'req-depot-01' },
        {
          routeId: ROUTE_ID,
          depotId: DEPOT_ID,
          physicalReceiptConfirmed: true,
        },
      );

      // Assert
      expect(result).toBe(expectedResult);
      expect(returnPackageToDepotUseCase.execute).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        packageId: PACKAGE_ID,
        routeId: ROUTE_ID,
        depotId: DEPOT_ID,
        physicalReceiptConfirmed: true,
        requestId: 'req-depot-01',
        correlationId: CORRELATION_ID,
      });
    });

    it('rejects when physicalReceiptConfirmed is not true with BadRequestException', async () => {
      // Arrange
      const { controller } = createTestContext();
      const context = createRequestContext();

      // Act & Assert
      await expect(
        controller.returnPackageToDepot(
          context,
          PACKAGE_ID,
          {},
          {
            routeId: ROUTE_ID,
            depotId: DEPOT_ID,
            physicalReceiptConfirmed: false,
          },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('reportIncident', () => {
    it('executes use case targeting a route or package and returns 201 result', async () => {
      // Arrange
      const { controller, reportIncidentUseCase } = createTestContext();
      const context = createRequestContext();
      const expectedResult = {
        incidentId: 'inc-1',
        status: 'OPEN' as const,
        type: 'WEATHER_DELAY',
        replayed: false,
      };
      reportIncidentUseCase.execute.mockResolvedValue(expectedResult);

      // Act
      const result = await controller.reportIncident(
        context,
        { 'idempotency-key': 'req-inc-01' },
        {
          routeId: ROUTE_ID,
          type: 'WEATHER_DELAY',
          description: 'Street flooded near destination',
        },
      );

      // Assert
      expect(result).toBe(expectedResult);
      expect(reportIncidentUseCase.execute).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        routeId: ROUTE_ID,
        routeStopId: undefined,
        packageId: undefined,
        type: 'WEATHER_DELAY',
        description: 'Street flooded near destination',
        requestId: 'req-inc-01',
        correlationId: CORRELATION_ID,
      });
    });

    it('rejects when all targets are missing with BadRequestException', async () => {
      // Arrange
      const { controller } = createTestContext();
      const context = createRequestContext();

      // Act & Assert
      await expect(
        controller.reportIncident(
          context,
          {},
          {
            type: 'UNKNOWN_INCIDENT',
            description: 'Incident without target',
          },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getDeliveryManifest', () => {
    it('executes query with view parameter and returns stops manifest', async () => {
      const { controller, getDeliveryManifestUseCase } = createTestContext();
      const context = createRequestContext();
      const expectedResult = {
        routeId: ROUTE_ID,
        routeState: 'IN_PROGRESS',
        view: 'pending' as const,
        stops: [
          {
            stopId: STOP_ID,
            stopNumber: 1,
            state: 'PENDING',
            latitude: 10.9878,
            longitude: -74.7889,
            packageIds: [PACKAGE_ID],
            packages: [
              {
                assignmentId: 'assign-1',
                packageId: PACKAGE_ID,
                trackingCode: 'TRK-001',
                state: 'OUT_FOR_DELIVERY' as const,
                assignmentState: 'ACTIVE' as const,
                outcome: null,
                receiptConfirmed: false,
              },
            ],
          },
        ],
      };
      getDeliveryManifestUseCase.execute.mockResolvedValue(expectedResult);

      const result = await controller.getDeliveryManifest(
        context,
        ROUTE_ID,
        'pending',
      );

      expect(result).toBe(expectedResult);
      expect(getDeliveryManifestUseCase.execute).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        routeId: ROUTE_ID,
        view: 'pending',
      });
    });

    it('defaults to view "all" when view query parameter is omitted or unrecognized', async () => {
      const { controller, getDeliveryManifestUseCase } = createTestContext();
      const context = createRequestContext();
      const expectedResult = {
        routeId: ROUTE_ID,
        routeState: 'IN_PROGRESS',
        view: 'all' as const,
        stops: [],
      };
      getDeliveryManifestUseCase.execute.mockResolvedValue(expectedResult);

      const result = await controller.getDeliveryManifest(
        context,
        ROUTE_ID,
        undefined,
      );

      expect(result).toBe(expectedResult);
      expect(getDeliveryManifestUseCase.execute).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        routeId: ROUTE_ID,
        view: 'all',
      });
    });

    it('maps DeliveryNotFoundError to NotFoundException', async () => {
      // Arrange
      const { controller, getDeliveryManifestUseCase } = createTestContext();
      const context = createRequestContext();
      getDeliveryManifestUseCase.execute.mockRejectedValue(
        new DeliveryNotFoundError(ROUTE_ID, 'Route'),
      );

      // Act & Assert
      await expect(
        controller.getDeliveryManifest(context, ROUTE_ID, 'all'),
      ).rejects.toThrow(NotFoundException);
    });

    it('maps DeliveryForbiddenError to ForbiddenException', async () => {
      // Arrange
      const { controller, getDeliveryManifestUseCase } = createTestContext();
      const context = createRequestContext();
      getDeliveryManifestUseCase.execute.mockRejectedValue(
        new DeliveryForbiddenError('Unauthorized to view route manifest'),
      );

      // Act & Assert
      await expect(
        controller.getDeliveryManifest(context, ROUTE_ID, 'all'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
