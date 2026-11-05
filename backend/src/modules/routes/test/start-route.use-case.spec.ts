import { StartRouteUseCase } from '../application/use-cases/start-route.use-case';
import { RouteState } from '../domain/route-state';
import { Route } from '../domain/route';
import {
  RouteForbiddenError,
  RouteNotFoundError,
  RouteResourceUnavailableError,
  RouteStateConflictError,
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
import { StartRouteCommand } from '../application/ports/route-contracts';

function createTestContext() {
  const uow = new FakeRouteLifecycleUnitOfWork();
  const accessPort = new FakeRouteAccessPort();
  const resourcesPort = new FakeRouteResourcesPort();
  const useCase = new StartRouteUseCase(uow, accessPort, resourcesPort);

  return { uow, accessPort, resourcesPort, useCase };
}

function createCommand(
  overrides?: Partial<StartRouteCommand>,
): StartRouteCommand {
  return {
    tenantId: overrides?.tenantId ?? 'tenant-a',
    routeId: overrides?.routeId ?? 'route-1',
    actorUserId: overrides?.actorUserId ?? 'user-courier',
    correlationId: overrides?.correlationId ?? 'corr-start-1',
  };
}

describe('StartRouteUseCase', () => {
  it('rejects start when actor is not the assigned courier or lacks permission', async () => {
    // Arrange
    const { useCase, uow, accessPort } = createTestContext();
    const route = new Route(
      createRoutePropsFixture({
        id: 'route-1',
        tenantId: 'tenant-a',
        state: RouteState.READY,
        courierId: 'courier-1',
        stops: createValidStopsFixture(2, 'tenant-a', 'route-1'),
      }),
    );
    uow.routes.seed(route);
    accessPort.canStart = false;
    const command = createCommand();

    // Act
    const act = () => useCase.execute(command);

    // Assert
    await expect(act).rejects.toThrow(RouteForbiddenError);
  });

  it('rejects start when route does not exist', async () => {
    // Arrange
    const { useCase } = createTestContext();
    const command = createCommand({ routeId: 'non-existent' });

    // Act
    const act = () => useCase.execute(command);

    // Assert
    await expect(act).rejects.toThrow(RouteNotFoundError);
  });

  it('rejects start when route is in PLANNED or already IN_PROGRESS state', async () => {
    // Arrange
    const { useCase, uow } = createTestContext();
    const plannedRoute = new Route(
      createRoutePropsFixture({
        id: 'route-1',
        tenantId: 'tenant-a',
        state: RouteState.PLANNED,
        stops: createValidStopsFixture(2, 'tenant-a', 'route-1'),
      }),
    );
    uow.routes.seed(plannedRoute);
    const command = createCommand();

    // Act
    const act = () => useCase.execute(command);

    // Assert
    await expect(act).rejects.toThrow(RouteStateConflictError);
  });

  it('rejects start when fleet resources are unavailable', async () => {
    // Arrange
    const { useCase, uow, resourcesPort } = createTestContext();
    const route = new Route(
      createRoutePropsFixture({
        id: 'route-1',
        tenantId: 'tenant-a',
        state: RouteState.READY,
        stops: createValidStopsFixture(2, 'tenant-a', 'route-1'),
      }),
    );
    uow.routes.seed(route);
    resourcesPort.validationResult = {
      isValid: false,
      reason: 'Courier shift has expired',
    };
    const command = createCommand();

    // Act
    const act = () => useCase.execute(command);

    // Assert
    await expect(act).rejects.toThrow(RouteResourceUnavailableError);
    await expect(act).rejects.toThrow(/Courier shift has expired/);
  });

  it('transitions route to IN_PROGRESS and all packages to IN_TRANSIT atomically', async () => {
    // Arrange
    const { useCase, uow } = createTestContext();
    const route = new Route(
      createRoutePropsFixture({
        id: 'route-1',
        tenantId: 'tenant-a',
        state: RouteState.READY,
        courierId: 'courier-1',
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
        currentState: 'READY_FOR_DISPATCH',
        weightKg: 2,
        volumeM3: 0.01,
      },
      {
        id: 'pkg-2',
        tenantId: 'tenant-a',
        trackingCode: 'TRK-2',
        currentState: 'READY_FOR_DISPATCH',
        weightKg: 3,
        volumeM3: 0.02,
      },
    ];

    const command = createCommand();

    // Act
    const result = await useCase.execute(command);

    // Assert
    expect(result.routeId).toBe('route-1');
    expect(result.state).toBe(RouteState.IN_PROGRESS);
    expect(result.updatedPackagesCount).toBe(2);
    expect(result.startedAt).toBeDefined();

    const updatedRoute = await uow.routes.findById('tenant-a', 'route-1');
    expect(updatedRoute?.state).toBe(RouteState.IN_PROGRESS);
    expect(updatedRoute?.startedAt).toBeDefined();

    expect(uow.packages.updatedStates).toEqual([
      {
        packageId: 'pkg-1',
        previousState: 'READY_FOR_DISPATCH',
        nextState: 'IN_TRANSIT',
      },
      {
        packageId: 'pkg-2',
        previousState: 'READY_FOR_DISPATCH',
        nextState: 'IN_TRANSIT',
      },
    ]);

    expect(uow.packages.recordedHistories).toHaveLength(2);
    expect(uow.packages.recordedHistories[0]?.nextState).toBe('IN_TRANSIT');

    expect(uow.audit.logs).toHaveLength(1);
    expect(uow.audit.logs[0]?.action).toBe('ROUTE_STARTED');
    expect(uow.audit.logs[0]?.newState).toBe(RouteState.IN_PROGRESS);

    expect(uow.outbox.recordedEvents).toHaveLength(1);
    expect(uow.outbox.recordedEvents[0]?.eventType).toBe('RouteStarted');
  });
});
