import { InterruptRouteUseCase } from '../application/use-cases/interrupt-route.use-case';
import { RouteState } from '../domain/route-state';
import { Route } from '../domain/route';
import {
  RouteForbiddenError,
  RouteNotFoundError,
  RouteStateConflictError,
  RouteValidationError,
} from '../domain/route-errors';
import {
  createRoutePropsFixture,
  createValidStopsFixture,
} from './fixtures/route.fixtures';
import {
  FakeRouteLifecycleUnitOfWork,
  FakeRouteAccessPort,
} from './fixtures/route-use-case.doubles';
import { InterruptRouteCommand } from '../application/ports/route-contracts';

function createTestContext() {
  const uow = new FakeRouteLifecycleUnitOfWork();
  const accessPort = new FakeRouteAccessPort();
  const useCase = new InterruptRouteUseCase(uow, accessPort);

  return { uow, accessPort, useCase };
}

function createCommand(
  overrides?: Partial<InterruptRouteCommand>,
): InterruptRouteCommand {
  return {
    tenantId: overrides?.tenantId ?? 'tenant-a',
    routeId: overrides?.routeId ?? 'route-1',
    actorUserId: overrides?.actorUserId ?? 'user-courier',
    correlationId: overrides?.correlationId ?? 'corr-int-1',
    reasonCode: overrides?.reasonCode ?? 'VEHICLE_BREAKDOWN',
    reason: overrides?.reason ?? 'Mechanical breakdown on avenue',
  };
}

function seedRoute(
  uow: FakeRouteLifecycleUnitOfWork,
  options?: {
    state?: RouteState;
    packageCount?: number;
  },
) {
  const state = options?.state ?? RouteState.IN_PROGRESS;
  const count = options?.packageCount ?? 3;

  const stops = createValidStopsFixture(count);
  const route = new Route(
    createRoutePropsFixture({
      id: 'route-1',
      tenantId: 'tenant-a',
      courierId: 'courier-1',
      state,
      stops,
    }),
  );
  uow.routes.seed(route);

  uow.packages.packages = stops.map((_, idx) => ({
    id: `pkg-${idx + 1}`,
    tenantId: 'tenant-a',
    trackingCode: `TRK-${idx + 1}`,
    currentState: 'IN_TRANSIT',
    weightKg: 5,
    volumeM3: 0.05,
  }));

  uow.assignments.assignments = stops.map((s, idx) => ({
    id: `asg-${idx + 1}`,
    packageId: `pkg-${idx + 1}`,
    routeId: 'route-1',
    routeStopId: s.id,
    status: 'ACTIVE' as const,
  }));

  return route;
}

describe('InterruptRouteUseCase', () => {
  it('rejects interruption when reasonCode is missing or empty', async () => {
    // Arrange
    const { useCase } = createTestContext();
    const command = createCommand({ reasonCode: '  ' });

    // Act
    const act = () => useCase.execute(command);

    // Assert
    await expect(act).rejects.toThrow(RouteValidationError);
    await expect(act).rejects.toThrow(/reasonCode is mandatory/i);
  });

  it('rejects interruption when actor is not authorized', async () => {
    // Arrange
    const { useCase, uow, accessPort } = createTestContext();
    seedRoute(uow);
    accessPort.canInterrupt = false;
    const command = createCommand();

    // Act
    const act = () => useCase.execute(command);

    // Assert
    await expect(act).rejects.toThrow(RouteForbiddenError);
  });

  it('rejects interruption when route does not exist', async () => {
    // Arrange
    const { useCase } = createTestContext();
    const command = createCommand({ routeId: 'non-existent-route' });

    // Act
    const act = () => useCase.execute(command);

    // Assert
    await expect(act).rejects.toThrow(RouteNotFoundError);
  });

  it('rejects interruption when route is not in IN_PROGRESS state', async () => {
    // Arrange
    const { useCase, uow } = createTestContext();
    seedRoute(uow, { state: RouteState.PLANNED });
    const command = createCommand();

    // Act
    const act = () => useCase.execute(command);

    // Assert
    await expect(act).rejects.toThrow(RouteStateConflictError);
    await expect(act).rejects.toThrow(/does not allow 'interrupt'/i);
  });

  it('interrupts IN_PROGRESS route, preserves active assignments and package states', async () => {
    // Arrange
    const { useCase, uow } = createTestContext();
    seedRoute(uow, { state: RouteState.IN_PROGRESS, packageCount: 3 });
    const command = createCommand({
      reasonCode: 'WEATHER_ALERT',
      reason: 'Heavy flood on route sector',
    });

    // Act
    const result = await useCase.execute(command);

    // Assert
    expect(result).toEqual({
      routeId: 'route-1',
      state: RouteState.INTERRUPTED,
      updatedPackagesCount: 0,
      correlationId: 'corr-int-1',
    });

    const savedRoute = await uow.routes.findById('tenant-a', 'route-1');
    expect(savedRoute?.state).toBe(RouteState.INTERRUPTED);

    // Verify packages remain in current state (IN_TRANSIT) - not reverted
    for (const pkg of uow.packages.packages) {
      expect(pkg.currentState).toBe('IN_TRANSIT');
    }
    expect(uow.packages.updatedStates).toHaveLength(0);
    expect(uow.packages.recordedHistories).toHaveLength(0);

    // Verify assignments remain ACTIVE - fleet and resources remain committed
    expect(uow.assignments.cancelledRouteIds).toHaveLength(0);
    for (const asg of uow.assignments.assignments) {
      expect(asg.status).toBe('ACTIVE');
    }

    // Verify audit log
    expect(uow.audit.logs).toHaveLength(1);
    expect(uow.audit.logs[0]).toMatchObject({
      tenantId: 'tenant-a',
      actorUserId: 'user-courier',
      action: 'ROUTE_INTERRUPTED',
      entityType: 'ROUTE',
      entityId: 'route-1',
      previousState: RouteState.IN_PROGRESS,
      newState: RouteState.INTERRUPTED,
      correlationId: 'corr-int-1',
      details: {
        reasonCode: 'WEATHER_ALERT',
        reason: 'Heavy flood on route sector',
      },
    });

    // Verify outbox domain event
    expect(uow.outbox.recordedEvents).toHaveLength(1);
    expect(uow.outbox.recordedEvents[0]).toMatchObject({
      tenantId: 'tenant-a',
      correlationId: 'corr-int-1',
      eventType: 'RouteInterrupted',
      payload: expect.objectContaining({
        routeId: 'route-1',
        fromState: RouteState.IN_PROGRESS,
        toState: RouteState.INTERRUPTED,
        reasonCode: 'WEATHER_ALERT',
      }),
    });
  });

  it('rolls back entire unit of work when transaction commit fails', async () => {
    // Arrange
    const { useCase, uow } = createTestContext();
    seedRoute(uow);
    uow.shouldFailOnCommit = true;
    const command = createCommand();

    // Act
    const act = () => useCase.execute(command);

    // Assert
    await expect(act).rejects.toThrow('Transaction commit failed');
  });
});
