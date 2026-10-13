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
  RoutesController,
} from '../presentation/routes.controller';
import { ListRoutesUseCase } from '../application/use-cases/list-routes.use-case';
import { GetRouteDetailUseCase } from '../application/use-cases/get-route-detail.use-case';
import { PrepareRouteUseCase } from '../application/use-cases/prepare-route.use-case';
import { StartRouteUseCase } from '../application/use-cases/start-route.use-case';
import { CancelRouteUseCase } from '../application/use-cases/cancel-route.use-case';
import { InterruptRouteUseCase } from '../application/use-cases/interrupt-route.use-case';
import { CloseRouteUseCase } from '../application/use-cases/close-route.use-case';
import { GetRouteSummaryUseCase } from '../application/use-cases/get-route-summary.use-case';
import {
  IdempotencyKeyReusedError,
  RouteAlreadyCompletedError,
  RouteConcurrencyConflictError,
  RouteCustodyUnresolvedError,
  RouteForbiddenError,
  RouteManifestInvalidError,
  RouteNotCompletedError,
  RouteNotFoundError,
  RouteResourceUnavailableError,
  RouteStateConflictError,
  RouteValidationError,
} from '../domain/route-errors';
import { RouteState } from '../domain/route-state';
import { RouteClosureMode } from '../domain/route-closure.types';
import type { RequestContext } from '../../../shared/presentation/request-context.decorator';
import type {
  PaginatedRoutesResult,
  RouteDetailResult,
  RouteOperationResult,
} from '../application/ports/route-contracts';
import type { CloseRouteResult } from '../application/ports/route-close-contracts';

const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const ACTOR_USER_ID = 'user-coord-001';
const CORRELATION_ID = 'corr-route-test-01';
const ROUTE_ID = '90000000-0000-4000-8000-000000000001';

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

function createOperationResult(
  overrides: Partial<RouteOperationResult> = {},
): RouteOperationResult {
  return {
    routeId: ROUTE_ID,
    state: RouteState.READY,
    updatedPackagesCount: 3,
    correlationId: CORRELATION_ID,
    ...overrides,
  };
}

function createTestContext() {
  const listRoutesUseCase = {
    execute: jest.fn(),
  } as unknown as jest.Mocked<ListRoutesUseCase>;

  const getRouteDetailUseCase = {
    execute: jest.fn(),
  } as unknown as jest.Mocked<GetRouteDetailUseCase>;

  const prepareRouteUseCase = {
    execute: jest.fn(),
  } as unknown as jest.Mocked<PrepareRouteUseCase>;

  const startRouteUseCase = {
    execute: jest.fn(),
  } as unknown as jest.Mocked<StartRouteUseCase>;

  const cancelRouteUseCase = {
    execute: jest.fn(),
  } as unknown as jest.Mocked<CancelRouteUseCase>;

  const interruptRouteUseCase = {
    execute: jest.fn(),
  } as unknown as jest.Mocked<InterruptRouteUseCase>;

  const closeRouteUseCase = {
    execute: jest.fn(),
  } as unknown as jest.Mocked<CloseRouteUseCase>;

  const getRouteSummaryUseCase = {
    execute: jest.fn(),
  } as unknown as jest.Mocked<GetRouteSummaryUseCase>;

  const controller = new RoutesController(
    listRoutesUseCase,
    getRouteDetailUseCase,
    prepareRouteUseCase,
    startRouteUseCase,
    cancelRouteUseCase,
    interruptRouteUseCase,
    closeRouteUseCase,
    getRouteSummaryUseCase,
  );

  return {
    controller,
    listRoutesUseCase,
    getRouteDetailUseCase,
    prepareRouteUseCase,
    startRouteUseCase,
    cancelRouteUseCase,
    interruptRouteUseCase,
    closeRouteUseCase,
    getRouteSummaryUseCase,
  };
}

describe('RoutesController', () => {
  it('protects route endpoints with AuthGuard and PermissionsGuard', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      RoutesController,
    ) as unknown[];
    const permission = Reflect.getMetadata(
      REQUIRED_PERMISSION_KEY,
      RoutesController,
    ) as unknown;

    expect(guards).toEqual([AuthGuard, PermissionsGuard]);
    expect(permission).toBe(COORDINATE_ROUTES_PERMISSION);
  });

  describe('listRoutes', () => {
    it('returns paginated routes when query parameters are valid', async () => {
      // Arrange
      const { controller, listRoutesUseCase } = createTestContext();
      const context = createRequestContext();
      const expectedResult: PaginatedRoutesResult = {
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
      };
      listRoutesUseCase.execute.mockResolvedValue(expectedResult);

      // Act
      const result = await controller.listRoutes(context, {
        page: '1',
        pageSize: '20',
        state: 'PLANNED',
      });

      // Assert
      expect(result).toEqual(expectedResult);
      expect(listRoutesUseCase.execute).toHaveBeenCalledTimes(1);
      expect(listRoutesUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          actorUserId: ACTOR_USER_ID,
          correlationId: CORRELATION_ID,
          page: 1,
          pageSize: 20,
          state: RouteState.PLANNED,
        }),
      );
    });

    it('rejects with BadRequestException when page is not a positive integer', async () => {
      // Arrange
      const { controller } = createTestContext();
      const context = createRequestContext();

      // Act
      const execute = () => controller.listRoutes(context, { page: '0' });

      // Assert
      await expect(execute).rejects.toThrow(BadRequestException);
    });

    it('rejects with BadRequestException when pageSize is outside 1 to 100', async () => {
      // Arrange
      const { controller } = createTestContext();
      const context = createRequestContext();

      // Act
      const execute = () => controller.listRoutes(context, { pageSize: '150' });

      // Assert
      await expect(execute).rejects.toThrow(BadRequestException);
    });

    it('rejects with BadRequestException when state filter is unknown', async () => {
      // Arrange
      const { controller } = createTestContext();
      const context = createRequestContext();

      // Act
      const execute = () =>
        controller.listRoutes(context, { state: 'UNKNOWN_STATE' });

      // Assert
      await expect(execute).rejects.toThrow(BadRequestException);
    });

    it('maps RouteValidationError from application use case to BadRequestException', async () => {
      // Arrange
      const { controller, listRoutesUseCase } = createTestContext();
      const context = createRequestContext();
      listRoutesUseCase.execute.mockRejectedValue(
        new RouteValidationError('Invalid date range filter'),
      );

      // Act
      const execute = () => controller.listRoutes(context, { page: '1' });

      // Assert
      await expect(execute).rejects.toThrow(BadRequestException);
    });

    it('maps RouteForbiddenError from application use case to ForbiddenException', async () => {
      // Arrange
      const { controller, listRoutesUseCase } = createTestContext();
      const context = createRequestContext();
      listRoutesUseCase.execute.mockRejectedValue(
        new RouteForbiddenError('Actor is not authorized to list routes'),
      );

      // Act
      const execute = () => controller.listRoutes(context, { page: '1' });

      // Assert
      await expect(execute).rejects.toThrow(ForbiddenException);
    });

    it('rethrows unexpected non-domain errors without altering them', async () => {
      // Arrange
      const { controller, listRoutesUseCase } = createTestContext();
      const context = createRequestContext();
      const unexpectedError = new Error('Database connection failed');
      listRoutesUseCase.execute.mockRejectedValue(unexpectedError);

      // Act
      const execute = () => controller.listRoutes(context, { page: '1' });

      // Assert
      await expect(execute).rejects.toThrow(unexpectedError);
    });
  });

  describe('getRouteDetail', () => {
    it('returns route detail projection when route exists and actor is authorized', async () => {
      // Arrange
      const { controller, getRouteDetailUseCase } = createTestContext();
      const context = createRequestContext();
      const expectedResult: RouteDetailResult = {
        id: ROUTE_ID,
        tenantId: TENANT_ID,
        state: RouteState.PLANNED,
        vehicleId: '50000000-0000-4000-8000-000000000001',
        courierId: '60000000-0000-4000-8000-000000000001',
        depotId: null,
        plannedStartAt: null,
        plannedEndAt: null,
        startedAt: null,
        completedAt: null,
        stops: [],
      };
      getRouteDetailUseCase.execute.mockResolvedValue(expectedResult);

      // Act
      const result = await controller.getRouteDetail(context, ROUTE_ID);

      // Assert
      expect(result).toEqual(expectedResult);
      expect(getRouteDetailUseCase.execute).toHaveBeenCalledTimes(1);
      expect(getRouteDetailUseCase.execute).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        correlationId: CORRELATION_ID,
        routeId: ROUTE_ID,
      });
    });

    it('rejects with BadRequestException when route id is not a valid UUID', async () => {
      // Arrange
      const { controller } = createTestContext();
      const context = createRequestContext();

      // Act
      const execute = () =>
        controller.getRouteDetail(context, 'invalid-uuid-123');

      // Assert
      await expect(execute).rejects.toThrow(BadRequestException);
    });

    it('maps RouteNotFoundError to NotFoundException', async () => {
      // Arrange
      const { controller, getRouteDetailUseCase } = createTestContext();
      const context = createRequestContext();
      getRouteDetailUseCase.execute.mockRejectedValue(
        new RouteNotFoundError(ROUTE_ID),
      );

      // Act
      const execute = () => controller.getRouteDetail(context, ROUTE_ID);

      // Assert
      await expect(execute).rejects.toThrow(NotFoundException);
    });

    it('maps RouteForbiddenError to ForbiddenException', async () => {
      // Arrange
      const { controller, getRouteDetailUseCase } = createTestContext();
      const context = createRequestContext();
      getRouteDetailUseCase.execute.mockRejectedValue(
        new RouteForbiddenError('Courier not assigned to this route'),
      );

      // Act
      const execute = () => controller.getRouteDetail(context, ROUTE_ID);

      // Assert
      await expect(execute).rejects.toThrow(ForbiddenException);
    });
  });

  describe('prepareRoute', () => {
    it('executes prepare use case successfully when depot presence is confirmed', async () => {
      // Arrange
      const { controller, prepareRouteUseCase } = createTestContext();
      const context = createRequestContext();
      const expectedResult = createOperationResult({
        state: RouteState.READY,
      });
      prepareRouteUseCase.execute.mockResolvedValue(expectedResult);

      // Act
      const result = await controller.prepareRoute(context, ROUTE_ID, {
        depotConfirmed: true,
      });

      // Assert
      expect(result).toEqual(expectedResult);
      expect(prepareRouteUseCase.execute).toHaveBeenCalledTimes(1);
      expect(prepareRouteUseCase.execute).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        correlationId: CORRELATION_ID,
        routeId: ROUTE_ID,
        depotConfirmed: true,
      });
    });

    it('rejects with BadRequestException when depotConfirmed property is missing or not boolean', async () => {
      // Arrange
      const { controller } = createTestContext();
      const context = createRequestContext();

      // Act
      const execute = () => controller.prepareRoute(context, ROUTE_ID, {});

      // Assert
      await expect(execute).rejects.toThrow(BadRequestException);
    });

    it('rejects with BadRequestException when route id is not a valid UUID', async () => {
      // Arrange
      const { controller } = createTestContext();
      const context = createRequestContext();

      // Act
      const execute = () =>
        controller.prepareRoute(context, 'invalid-id', {
          depotConfirmed: true,
        });

      // Assert
      await expect(execute).rejects.toThrow(BadRequestException);
    });

    it('maps RouteStateConflictError to ConflictException', async () => {
      // Arrange
      const { controller, prepareRouteUseCase } = createTestContext();
      const context = createRequestContext();
      prepareRouteUseCase.execute.mockRejectedValue(
        new RouteStateConflictError(ROUTE_ID, RouteState.READY, 'PREPARE'),
      );

      // Act
      const execute = () =>
        controller.prepareRoute(context, ROUTE_ID, { depotConfirmed: true });

      // Assert
      await expect(execute).rejects.toThrow(ConflictException);
    });

    it('maps RouteResourceUnavailableError to ConflictException', async () => {
      // Arrange
      const { controller, prepareRouteUseCase } = createTestContext();
      const context = createRequestContext();
      prepareRouteUseCase.execute.mockRejectedValue(
        new RouteResourceUnavailableError(
          'VEHICLE',
          'vehicle-001',
          'Vehicle is under maintenance',
        ),
      );

      // Act
      const execute = () =>
        controller.prepareRoute(context, ROUTE_ID, { depotConfirmed: true });

      // Assert
      await expect(execute).rejects.toThrow(ConflictException);
    });

    it('maps RouteManifestInvalidError to BadRequestException', async () => {
      // Arrange
      const { controller, prepareRouteUseCase } = createTestContext();
      const context = createRequestContext();
      prepareRouteUseCase.execute.mockRejectedValue(
        new RouteManifestInvalidError('Route manifest has no active packages'),
      );

      // Act
      const execute = () =>
        controller.prepareRoute(context, ROUTE_ID, { depotConfirmed: true });

      // Assert
      await expect(execute).rejects.toThrow(BadRequestException);
    });

    it('maps RouteConcurrencyConflictError to ConflictException', async () => {
      // Arrange
      const { controller, prepareRouteUseCase } = createTestContext();
      const context = createRequestContext();
      prepareRouteUseCase.execute.mockRejectedValue(
        new RouteConcurrencyConflictError('Concurrent route update detected'),
      );

      // Act
      const execute = () =>
        controller.prepareRoute(context, ROUTE_ID, { depotConfirmed: true });

      // Assert
      await expect(execute).rejects.toThrow(ConflictException);
    });

    it('maps RouteForbiddenError to ForbiddenException', async () => {
      // Arrange
      const { controller, prepareRouteUseCase } = createTestContext();
      const context = createRequestContext();
      prepareRouteUseCase.execute.mockRejectedValue(
        new RouteForbiddenError('Actor is not authorized to prepare route'),
      );

      // Act
      const execute = () =>
        controller.prepareRoute(context, ROUTE_ID, { depotConfirmed: true });

      // Assert
      await expect(execute).rejects.toThrow(ForbiddenException);
    });

    it('maps RouteNotFoundError to NotFoundException', async () => {
      // Arrange
      const { controller, prepareRouteUseCase } = createTestContext();
      const context = createRequestContext();
      prepareRouteUseCase.execute.mockRejectedValue(
        new RouteNotFoundError(ROUTE_ID),
      );

      // Act
      const execute = () =>
        controller.prepareRoute(context, ROUTE_ID, { depotConfirmed: true });

      // Assert
      await expect(execute).rejects.toThrow(NotFoundException);
    });
  });

  describe('startRoute', () => {
    it('executes start use case successfully', async () => {
      // Arrange
      const { controller, startRouteUseCase } = createTestContext();
      const context = createRequestContext();
      const expectedResult = createOperationResult({
        state: RouteState.IN_PROGRESS,
        startedAt: '2026-10-06T09:15:00.000Z',
      });
      startRouteUseCase.execute.mockResolvedValue(expectedResult);

      // Act
      const result = await controller.startRoute(context, ROUTE_ID, {});

      // Assert
      expect(result).toEqual(expectedResult);
      expect(startRouteUseCase.execute).toHaveBeenCalledTimes(1);
      expect(startRouteUseCase.execute).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        correlationId: CORRELATION_ID,
        routeId: ROUTE_ID,
      });
    });

    it('allows starting a route without request body', async () => {
      // Arrange
      const { controller, startRouteUseCase } = createTestContext();
      const context = createRequestContext();
      const expectedResult = createOperationResult({
        state: RouteState.IN_PROGRESS,
        startedAt: '2026-10-06T09:15:00.000Z',
      });
      startRouteUseCase.execute.mockResolvedValue(expectedResult);

      // Act
      const result = await controller.startRoute(context, ROUTE_ID);

      // Assert
      expect(result).toEqual(expectedResult);
      expect(startRouteUseCase.execute).toHaveBeenCalledTimes(1);
    });

    it('rejects with BadRequestException when route id is not a valid UUID', async () => {
      // Arrange
      const { controller } = createTestContext();
      const context = createRequestContext();

      // Act
      const execute = () => controller.startRoute(context, 'invalid-route-id');

      // Assert
      await expect(execute).rejects.toThrow(BadRequestException);
    });

    it('maps RouteStateConflictError to ConflictException', async () => {
      // Arrange
      const { controller, startRouteUseCase } = createTestContext();
      const context = createRequestContext();
      startRouteUseCase.execute.mockRejectedValue(
        new RouteStateConflictError(ROUTE_ID, RouteState.PLANNED, 'START'),
      );

      // Act
      const execute = () => controller.startRoute(context, ROUTE_ID);

      // Assert
      await expect(execute).rejects.toThrow(ConflictException);
    });

    it('maps RouteResourceUnavailableError to ConflictException', async () => {
      // Arrange
      const { controller, startRouteUseCase } = createTestContext();
      const context = createRequestContext();
      startRouteUseCase.execute.mockRejectedValue(
        new RouteResourceUnavailableError(
          'COURIER',
          'courier-001',
          'Assigned courier is not active',
        ),
      );

      // Act
      const execute = () => controller.startRoute(context, ROUTE_ID);

      // Assert
      await expect(execute).rejects.toThrow(ConflictException);
    });

    it('maps RouteForbiddenError to ForbiddenException when actor is not assigned courier', async () => {
      // Arrange
      const { controller, startRouteUseCase } = createTestContext();
      const context = createRequestContext();
      startRouteUseCase.execute.mockRejectedValue(
        new RouteForbiddenError(
          'Actor is not the courier assigned to this route',
        ),
      );

      // Act
      const execute = () => controller.startRoute(context, ROUTE_ID);

      // Assert
      await expect(execute).rejects.toThrow(ForbiddenException);
    });

    it('maps RouteNotFoundError to NotFoundException', async () => {
      // Arrange
      const { controller, startRouteUseCase } = createTestContext();
      const context = createRequestContext();
      startRouteUseCase.execute.mockRejectedValue(
        new RouteNotFoundError(ROUTE_ID),
      );

      // Act
      const execute = () => controller.startRoute(context, ROUTE_ID);

      // Assert
      await expect(execute).rejects.toThrow(NotFoundException);
    });
  });

  describe('cancelRoute', () => {
    it('executes cancel use case successfully when reasonCode is provided', async () => {
      // Arrange
      const { controller, cancelRouteUseCase } = createTestContext();
      const context = createRequestContext();
      const expectedResult = createOperationResult({
        state: RouteState.CANCELLED,
      });
      cancelRouteUseCase.execute.mockResolvedValue(expectedResult);

      // Act
      const result = await controller.cancelRoute(context, ROUTE_ID, {
        reasonCode: 'CUSTOMER_REQUEST',
        reason: 'Customer requested schedule cancellation',
      });

      // Assert
      expect(result).toEqual(expectedResult);
      expect(cancelRouteUseCase.execute).toHaveBeenCalledTimes(1);
      expect(cancelRouteUseCase.execute).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        correlationId: CORRELATION_ID,
        routeId: ROUTE_ID,
        reasonCode: 'CUSTOMER_REQUEST',
        reason: 'Customer requested schedule cancellation',
      });
    });

    it('rejects with BadRequestException when reasonCode is missing or empty', async () => {
      // Arrange
      const { controller } = createTestContext();
      const context = createRequestContext();

      // Act
      const execute = () =>
        controller.cancelRoute(context, ROUTE_ID, { reasonCode: '   ' });

      // Assert
      await expect(execute).rejects.toThrow(BadRequestException);
    });

    it('rejects with BadRequestException when body is null or not an object', async () => {
      // Arrange
      const { controller } = createTestContext();
      const context = createRequestContext();

      // Act
      const execute = () => controller.cancelRoute(context, ROUTE_ID, null);

      // Assert
      await expect(execute).rejects.toThrow(BadRequestException);
    });

    it('rejects with BadRequestException when route id is not a valid UUID', async () => {
      // Arrange
      const { controller } = createTestContext();
      const context = createRequestContext();

      // Act
      const execute = () =>
        controller.cancelRoute(context, 'invalid-uuid', {
          reasonCode: 'OPERATIONAL',
        });

      // Assert
      await expect(execute).rejects.toThrow(BadRequestException);
    });

    it('maps RouteStateConflictError to ConflictException when route already started', async () => {
      // Arrange
      const { controller, cancelRouteUseCase } = createTestContext();
      const context = createRequestContext();
      cancelRouteUseCase.execute.mockRejectedValue(
        new RouteStateConflictError(ROUTE_ID, RouteState.IN_PROGRESS, 'CANCEL'),
      );

      // Act
      const execute = () =>
        controller.cancelRoute(context, ROUTE_ID, {
          reasonCode: 'OPERATIONAL',
        });

      // Assert
      await expect(execute).rejects.toThrow(ConflictException);
    });

    it('maps RouteForbiddenError to ForbiddenException', async () => {
      // Arrange
      const { controller, cancelRouteUseCase } = createTestContext();
      const context = createRequestContext();
      cancelRouteUseCase.execute.mockRejectedValue(
        new RouteForbiddenError('Actor is not authorized to cancel routes'),
      );

      // Act
      const execute = () =>
        controller.cancelRoute(context, ROUTE_ID, {
          reasonCode: 'OPERATIONAL',
        });

      // Assert
      await expect(execute).rejects.toThrow(ForbiddenException);
    });

    it('maps RouteNotFoundError to NotFoundException', async () => {
      // Arrange
      const { controller, cancelRouteUseCase } = createTestContext();
      const context = createRequestContext();
      cancelRouteUseCase.execute.mockRejectedValue(
        new RouteNotFoundError(ROUTE_ID),
      );

      // Act
      const execute = () =>
        controller.cancelRoute(context, ROUTE_ID, {
          reasonCode: 'OPERATIONAL',
        });

      // Assert
      await expect(execute).rejects.toThrow(NotFoundException);
    });
  });

  describe('interruptRoute', () => {
    it('executes interrupt use case successfully when reasonCode is provided', async () => {
      // Arrange
      const { controller, interruptRouteUseCase } = createTestContext();
      const context = createRequestContext();
      const expectedResult = createOperationResult({
        state: RouteState.INTERRUPTED,
      });
      interruptRouteUseCase.execute.mockResolvedValue(expectedResult);

      // Act
      const result = await controller.interruptRoute(context, ROUTE_ID, {
        reasonCode: 'VEHICLE_BREAKDOWN',
        reason: 'Flat tire on highway',
      });

      // Assert
      expect(result).toEqual(expectedResult);
      expect(interruptRouteUseCase.execute).toHaveBeenCalledTimes(1);
      expect(interruptRouteUseCase.execute).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        actorUserId: ACTOR_USER_ID,
        correlationId: CORRELATION_ID,
        routeId: ROUTE_ID,
        reasonCode: 'VEHICLE_BREAKDOWN',
        reason: 'Flat tire on highway',
      });
    });

    it('rejects with BadRequestException when reasonCode is missing or empty', async () => {
      // Arrange
      const { controller } = createTestContext();
      const context = createRequestContext();

      // Act
      const execute = () =>
        controller.interruptRoute(context, ROUTE_ID, { reasonCode: '' });

      // Assert
      await expect(execute).rejects.toThrow(BadRequestException);
    });

    it('rejects with BadRequestException when route id is not a valid UUID', async () => {
      // Arrange
      const { controller } = createTestContext();
      const context = createRequestContext();

      // Act
      const execute = () =>
        controller.interruptRoute(context, 'invalid-route-id', {
          reasonCode: 'BREAKDOWN',
        });

      // Assert
      await expect(execute).rejects.toThrow(BadRequestException);
    });

    it('maps RouteStateConflictError to ConflictException when route is not in progress', async () => {
      // Arrange
      const { controller, interruptRouteUseCase } = createTestContext();
      const context = createRequestContext();
      interruptRouteUseCase.execute.mockRejectedValue(
        new RouteStateConflictError(ROUTE_ID, RouteState.READY, 'INTERRUPT'),
      );

      // Act
      const execute = () =>
        controller.interruptRoute(context, ROUTE_ID, {
          reasonCode: 'BREAKDOWN',
        });

      // Assert
      await expect(execute).rejects.toThrow(ConflictException);
    });

    it('maps RouteForbiddenError to ForbiddenException', async () => {
      // Arrange
      const { controller, interruptRouteUseCase } = createTestContext();
      const context = createRequestContext();
      interruptRouteUseCase.execute.mockRejectedValue(
        new RouteForbiddenError('Actor is not authorized to interrupt routes'),
      );

      // Act
      const execute = () =>
        controller.interruptRoute(context, ROUTE_ID, {
          reasonCode: 'BREAKDOWN',
        });

      // Assert
      await expect(execute).rejects.toThrow(ForbiddenException);
    });

    it('maps RouteNotFoundError to NotFoundException', async () => {
      // Arrange
      const { controller, interruptRouteUseCase } = createTestContext();
      const context = createRequestContext();
      interruptRouteUseCase.execute.mockRejectedValue(
        new RouteNotFoundError(ROUTE_ID),
      );

      // Act
      const execute = () =>
        controller.interruptRoute(context, ROUTE_ID, {
          reasonCode: 'BREAKDOWN',
        });

      // Assert
      await expect(execute).rejects.toThrow(NotFoundException);
    });
  });

  describe('closeRoute', () => {
    const IDEMPOTENCY_KEY = '55555555-5555-4555-8555-555555555555';
    const VALID_HEADERS = { 'idempotency-key': IDEMPOTENCY_KEY };

    it('successfully closes route in REGULAR mode', async () => {
      const { controller, closeRouteUseCase } = createTestContext();
      const context = createRequestContext();
      const mockResult: CloseRouteResult = {
        routeId: ROUTE_ID,
        closureId: 'closure-1',
        state: 'COMPLETED',
        completedAt: new Date(),
        summary: {
          totalAssigned: 3,
          deliveredCount: 3,
          failedCount: 0,
          rescheduledCount: 0,
          returnedCount: 0,
          pendingCount: 0,
          deliveryEffectiveness: 1,
        },
        replayed: false,
      };
      closeRouteUseCase.execute.mockResolvedValue(mockResult);

      const result = await controller.closeRoute(
        context,
        VALID_HEADERS,
        ROUTE_ID,
        { mode: 'REGULAR' },
      );

      expect(result).toEqual(mockResult);
      expect(closeRouteUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: context.tenantId,
          actorUserId: context.actorUserId,
          routeId: ROUTE_ID,
          requestId: IDEMPOTENCY_KEY,
          mode: RouteClosureMode.REGULAR,
        }),
      );
    });

    it('rejects with BadRequestException when idempotency key is missing or invalid', async () => {
      const { controller } = createTestContext();
      const context = createRequestContext();

      await expect(
        controller.closeRoute(context, {}, ROUTE_ID, { mode: 'REGULAR' }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.closeRoute(
          context,
          { 'idempotency-key': 'not-a-uuid' },
          ROUTE_ID,
          { mode: 'REGULAR' },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects with BadRequestException when mode is FORCED without reasonCode or notes', async () => {
      const { controller } = createTestContext();
      const context = createRequestContext();

      await expect(
        controller.closeRoute(context, VALID_HEADERS, ROUTE_ID, {
          mode: 'FORCED',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('maps RouteCustodyUnresolvedError to ConflictException', async () => {
      const { controller, closeRouteUseCase } = createTestContext();
      const context = createRequestContext();
      closeRouteUseCase.execute.mockRejectedValue(
        new RouteCustodyUnresolvedError('Remaining cargo requires physical receipt'),
      );

      await expect(
        controller.closeRoute(context, VALID_HEADERS, ROUTE_ID, {
          mode: 'REGULAR',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('maps RouteAlreadyCompletedError to ConflictException', async () => {
      const { controller, closeRouteUseCase } = createTestContext();
      const context = createRequestContext();
      closeRouteUseCase.execute.mockRejectedValue(
        new RouteAlreadyCompletedError(ROUTE_ID),
      );

      await expect(
        controller.closeRoute(context, VALID_HEADERS, ROUTE_ID, {
          mode: 'REGULAR',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('maps IdempotencyKeyReusedError to ConflictException', async () => {
      const { controller, closeRouteUseCase } = createTestContext();
      const context = createRequestContext();
      closeRouteUseCase.execute.mockRejectedValue(
        new IdempotencyKeyReusedError(IDEMPOTENCY_KEY),
      );

      await expect(
        controller.closeRoute(context, VALID_HEADERS, ROUTE_ID, {
          mode: 'REGULAR',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('maps RouteForbiddenError to ForbiddenException', async () => {
      const { controller, closeRouteUseCase } = createTestContext();
      const context = createRequestContext();
      closeRouteUseCase.execute.mockRejectedValue(
        new RouteForbiddenError(),
      );

      await expect(
        controller.closeRoute(context, VALID_HEADERS, ROUTE_ID, {
          mode: 'REGULAR',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('maps RouteNotFoundError to NotFoundException', async () => {
      const { controller, closeRouteUseCase } = createTestContext();
      const context = createRequestContext();
      closeRouteUseCase.execute.mockRejectedValue(
        new RouteNotFoundError(ROUTE_ID),
      );

      await expect(
        controller.closeRoute(context, VALID_HEADERS, ROUTE_ID, {
          mode: 'REGULAR',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getRouteSummary', () => {
    it('returns summary when route is closed and user is authorized', async () => {
      const { controller, getRouteSummaryUseCase } = createTestContext();
      const context = createRequestContext();
      const mockSummary = {
        routeId: ROUTE_ID,
        closureId: 'closure-1',
        totalAssigned: 5,
        deliveredCount: 5,
        effectiveness: 1,
      } as any;
      getRouteSummaryUseCase.execute.mockResolvedValue(mockSummary);

      const result = await controller.getRouteSummary(context, ROUTE_ID);

      expect(result).toEqual(mockSummary);
      expect(getRouteSummaryUseCase.execute).toHaveBeenCalledWith({
        tenantId: context.tenantId,
        actorUserId: context.actorUserId,
        correlationId: context.correlationId,
        routeId: ROUTE_ID,
      });
    });

    it('maps RouteNotCompletedError to ConflictException when route is still open', async () => {
      const { controller, getRouteSummaryUseCase } = createTestContext();
      const context = createRequestContext();
      getRouteSummaryUseCase.execute.mockRejectedValue(
        new RouteNotCompletedError(ROUTE_ID),
      );

      await expect(
        controller.getRouteSummary(context, ROUTE_ID),
      ).rejects.toThrow(ConflictException);
    });

    it('maps RouteNotFoundError to NotFoundException', async () => {
      const { controller, getRouteSummaryUseCase } = createTestContext();
      const context = createRequestContext();
      getRouteSummaryUseCase.execute.mockRejectedValue(
        new RouteNotFoundError(ROUTE_ID),
      );

      await expect(
        controller.getRouteSummary(context, ROUTE_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('maps RouteForbiddenError to ForbiddenException', async () => {
      const { controller, getRouteSummaryUseCase } = createTestContext();
      const context = createRequestContext();
      getRouteSummaryUseCase.execute.mockRejectedValue(
        new RouteForbiddenError(),
      );

      await expect(
        controller.getRouteSummary(context, ROUTE_ID),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
