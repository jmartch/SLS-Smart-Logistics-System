import { PrepareRouteUseCase } from '../application/use-cases/prepare-route.use-case';
import { RouteState } from '../domain/route-state';
import { Route } from '../domain/route';
import {
  RouteForbiddenError,
  RouteNotFoundError,
  RouteResourceUnavailableError,
  RouteStateConflictError,
  RouteManifestInvalidError,
  RouteValidationError,
} from '../domain/route-errors';
import {
  createRoutePropsFixture,
  createValidStopsFixture,
} from './fixtures/route.fixtures';
import {
  FakeRouteLifecycleUnitOfWork,
  FakeRouteAccessPort,
  FakeRouteResourcesPort,
} from './fixtures/route-use-case.doubles';
import { PrepareRouteCommand } from '../application/ports/route-contracts';

function createTestContext() {
  const uow = new FakeRouteLifecycleUnitOfWork();
  const accessPort = new FakeRouteAccessPort();
  const resourcesPort = new FakeRouteResourcesPort();
  const useCase = new PrepareRouteUseCase(uow, accessPort, resourcesPort);

  return { uow, accessPort, resourcesPort, useCase };
}

function createCommand(
  overrides?: Partial<PrepareRouteCommand>,
): PrepareRouteCommand {
  return {
    tenantId: overrides?.tenantId ?? 'tenant-a',
    routeId: overrides?.routeId ?? 'route-1',
    actorUserId: overrides?.actorUserId ?? 'user-coordinator',
    correlationId: overrides?.correlationId ?? 'corr-prep-1',
    depotConfirmed: overrides?.depotConfirmed ?? true,
  };
}

describe('PrepareRouteUseCase', () => {
  it('rejects preparation when depot presence is not confirmed', async () => {
    // Arrange
    const { useCase } = createTestContext();
    const command = createCommand({ depotConfirmed: false });

    // Act
    const act = () => useCase.execute(command);

    // Assert
    await expect(act).rejects.toThrow(RouteValidationError);
    await expect(act).rejects.toThrow(/depotConfirmed: true/i);
  });

  it('rejects preparation when actor is not authorized', async () => {
    // Arrange
    const { useCase, accessPort } = createTestContext();
    accessPort.canPrepare = false;
    const command = createCommand();

    // Act
    const act = () => useCase.execute(command);

    // Assert
    await expect(act).rejects.toThrow(RouteForbiddenError);
  });

  it('rejects preparation when route does not exist', async () => {
    // Arrange
    const { useCase } = createTestContext();
    const command = createCommand({ routeId: 'non-existent-route' });

    // Act
    const act = () => useCase.execute(command);

    // Assert
    await expect(act).rejects.toThrow(RouteNotFoundError);
  });

  it('rejects preparation when fleet resources are unavailable', async () => {
    // Arrange
    const { useCase, uow, resourcesPort } = createTestContext();
    const route = new Route(
      createRoutePropsFixture({
        id: 'route-1',
        tenantId: 'tenant-a',
        state: RouteState.PLANNED,
        stops: createValidStopsFixture(2, 'tenant-a', 'route-1'),
      }),
    );
    uow.routes.seed(route);
    resourcesPort.validationResult = {
      isValid: false,
      reason: 'Vehicle is currently in maintenance',
    };
    const command = createCommand();

    // Act
    const act = () => useCase.execute(command);

    // Assert
    await expect(act).rejects.toThrow(RouteResourceUnavailableError);
    await expect(act).rejects.toThrow(/Vehicle is currently in maintenance/);
  });

  it('rejects preparation when route is already in READY or IN_PROGRESS state', async () => {
    // Arrange
    const { useCase, uow } = createTestContext();
    const readyRoute = new Route(
      createRoutePropsFixture({
        id: 'route-1',
        tenantId: 'tenant-a',
        state: RouteState.READY,
        stops: createValidStopsFixture(2, 'tenant-a', 'route-1'),
      }),
    );
    uow.routes.seed(readyRoute);
    const command = createCommand();

    // Act
    const act = () => useCase.execute(command);

    // Assert
    await expect(act).rejects.toThrow(RouteStateConflictError);
  });

  it('rejects preparation when route manifest has zero stops or no active assignments', async () => {
    // Arrange
    const { useCase, uow } = createTestContext();
    const emptyRoute = new Route(
      createRoutePropsFixture({
        id: 'route-1',
        tenantId: 'tenant-a',
        state: RouteState.PLANNED,
        stops: [],
      }),
    );
    uow.routes.seed(emptyRoute);
    const command = createCommand();

    // Act
    const act = () => useCase.execute(command);

    // Assert
    await expect(act).rejects.toThrow(RouteManifestInvalidError);
  });

  it('transitions route to READY and all packages to READY_FOR_DISPATCH atomically', async () => {
    // Arrange
    const { useCase, uow } = createTestContext();
    const route = new Route(
      createRoutePropsFixture({
        id: 'route-1',
        tenantId: 'tenant-a',
        state: RouteState.PLANNED,
        stops: createValidStopsFixture(2, 'tenant-a', 'route-1'),
      }),
    );
    uow.routes.seed(route);

    uow.assignments.assignments = [
      {
        id: 'asgn-1',
        packageId: 'pkg-1',
        routeId: 'route-1',
        status: 'ACTIVE',
      },
      {
        id: 'asgn-2',
        packageId: 'pkg-2',
        routeId: 'route-1',
        status: 'ACTIVE',
      },
    ];

    uow.packages.packages = [
      {
        id: 'pkg-1',
        tenantId: 'tenant-a',
        trackingCode: 'TRK-1',
        currentState: 'ASSIGNED_TO_ROUTE',
        weightKg: 2,
        volumeM3: 0.01,
      },
      {
        id: 'pkg-2',
        tenantId: 'tenant-a',
        trackingCode: 'TRK-2',
        currentState: 'ASSIGNED_TO_ROUTE',
        weightKg: 3,
        volumeM3: 0.02,
      },
    ];

    const command = createCommand();

    // Act
    const result = await useCase.execute(command);

    // Assert
    expect(result.routeId).toBe('route-1');
    expect(result.state).toBe(RouteState.READY);
    expect(result.updatedPackagesCount).toBe(2);
    expect(result.correlationId).toBe('corr-prep-1');

    const updatedRoute = await uow.routes.findById('tenant-a', 'route-1');
    expect(updatedRoute?.state).toBe(RouteState.READY);

    expect(uow.packages.updatedStates).toEqual([
      {
        packageId: 'pkg-1',
        previousState: 'ASSIGNED_TO_ROUTE',
        nextState: 'READY_FOR_DISPATCH',
      },
      {
        packageId: 'pkg-2',
        previousState: 'ASSIGNED_TO_ROUTE',
        nextState: 'READY_FOR_DISPATCH',
      },
    ]);

    expect(uow.packages.recordedHistories).toHaveLength(2);
    expect(uow.packages.recordedHistories[0]?.changedByUserId).toBe(
      'user-coordinator',
    );

    expect(uow.audit.logs).toHaveLength(1);
    expect(uow.audit.logs[0]?.action).toBe('ROUTE_PREPARED');
    expect(uow.audit.logs[0]?.newState).toBe(RouteState.READY);

    expect(uow.outbox.recordedEvents).toHaveLength(1);
    expect(uow.outbox.recordedEvents[0]?.eventType).toBe('RoutePrepared');
    expect(uow.outbox.recordedEvents[0]?.correlationId).toBe('corr-prep-1');
  });

  it('aborts the transaction and commits zero changes when an error is thrown', async () => {
    // Arrange
    const { useCase, uow } = createTestContext();
    const route = new Route(
      createRoutePropsFixture({
        id: 'route-1',
        tenantId: 'tenant-a',
        state: RouteState.PLANNED,
        stops: createValidStopsFixture(1, 'tenant-a', 'route-1'),
      }),
    );
    uow.routes.seed(route);
    uow.shouldFailOnCommit = true;

    uow.assignments.assignments = [
      {
        id: 'asgn-1',
        packageId: 'pkg-1',
        routeId: 'route-1',
        status: 'ACTIVE',
      },
    ];
    uow.packages.packages = [
      {
        id: 'pkg-1',
        tenantId: 'tenant-a',
        trackingCode: 'TRK-1',
        currentState: 'ASSIGNED_TO_ROUTE',
        weightKg: 1,
        volumeM3: 0.01,
      },
    ];

    const command = createCommand();

    // Act
    const act = () => useCase.execute(command);

    // Assert
    await expect(act).rejects.toThrow('Transaction commit failed');
  });
});
