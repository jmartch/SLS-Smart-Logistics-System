import { CancelRouteUseCase } from '../application/use-cases/cancel-route.use-case';
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
import { CancelRouteCommand } from '../application/ports/route-contracts';

function createTestContext() {
  const uow = new FakeRouteLifecycleUnitOfWork();
  const accessPort = new FakeRouteAccessPort();
  const useCase = new CancelRouteUseCase(uow, accessPort);

  return { uow, accessPort, useCase };
}

function createCommand(
  overrides?: Partial<CancelRouteCommand>,
): CancelRouteCommand {
  return {
    tenantId: overrides?.tenantId ?? 'tenant-a',
    routeId: overrides?.routeId ?? 'route-1',
    actorUserId: overrides?.actorUserId ?? 'user-coordinator',
    correlationId: overrides?.correlationId ?? 'corr-cancel-1',
    reasonCode: overrides?.reasonCode ?? 'CLIENT_CANCELLED',
    reason: overrides?.reason ?? 'Customer cancelled the request',
  };
}

function seedRoute(
  uow: FakeRouteLifecycleUnitOfWork,
  options?: {
    state?: RouteState;
    packageCount?: number;
    packagesState?: string;
  },
) {
  const state = options?.state ?? RouteState.PLANNED;
  const count = options?.packageCount ?? 3;
  const pkgState =
    options?.packagesState ??
    (state === RouteState.READY ? 'READY_FOR_DISPATCH' : 'ASSIGNED_TO_ROUTE');

  const stops = createValidStopsFixture(count);
  const route = new Route(
    createRoutePropsFixture({
      id: 'route-1',
      tenantId: 'tenant-a',
      state,
      stops,
    }),
  );
  uow.routes.seed(route);

  uow.packages.packages = stops.map((_, idx) => ({
    id: `pkg-${idx + 1}`,
    tenantId: 'tenant-a',
    trackingCode: `TRK-${idx + 1}`,
    currentState: pkgState,
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

describe('CancelRouteUseCase', () => {
  it('rejects cancellation when reasonCode is missing or empty', async () => {
    // Arrange
    const { useCase } = createTestContext();
    const command = createCommand({ reasonCode: '   ' });

    // Act
    const act = () => useCase.execute(command);

    // Assert
    await expect(act).rejects.toThrow(RouteValidationError);
    await expect(act).rejects.toThrow(/reasonCode is mandatory/i);
  });

  it('rejects cancellation when actor is not authorized', async () => {
    // Arrange
    const { useCase, accessPort } = createTestContext();
    accessPort.canCancel = false;
    const command = createCommand();

    // Act
    const act = () => useCase.execute(command);

    // Assert
    await expect(act).rejects.toThrow(RouteForbiddenError);
  });

  it('rejects cancellation when route does not exist', async () => {
    // Arrange
    const { useCase } = createTestContext();
    const command = createCommand({ routeId: 'non-existent-route' });

    // Act
    const act = () => useCase.execute(command);

    // Assert
    await expect(act).rejects.toThrow(RouteNotFoundError);
  });

  it('rejects cancellation when route is already IN_PROGRESS or terminal', async () => {
    // Arrange
    const { useCase, uow } = createTestContext();
    seedRoute(uow, { state: RouteState.IN_PROGRESS });
    const command = createCommand();

    // Act
    const act = () => useCase.execute(command);

    // Assert
    await expect(act).rejects.toThrow(RouteStateConflictError);
    await expect(act).rejects.toThrow(/does not allow 'cancel'/i);
  });

  it('cancels PLANNED route, reverts packages to PENDING_ASSIGNMENT, and cancels assignments', async () => {
    // Arrange
    const { useCase, uow } = createTestContext();
    seedRoute(uow, { state: RouteState.PLANNED, packageCount: 3 });
    const command = createCommand({
      reasonCode: 'OPERATIONAL_CHANGE',
      reason: 'Fleet rerouted to emergency sector',
    });

    // Act
    const result = await useCase.execute(command);

    // Assert
    expect(result).toEqual({
      routeId: 'route-1',
      state: RouteState.CANCELLED,
      updatedPackagesCount: 3,
      correlationId: 'corr-cancel-1',
    });

    const savedRoute = await uow.routes.findById('tenant-a', 'route-1');
    expect(savedRoute?.state).toBe(RouteState.CANCELLED);

    // Verify all packages reverted to PENDING_ASSIGNMENT
    expect(uow.packages.packages).toHaveLength(3);
    for (const pkg of uow.packages.packages) {
      expect(pkg.currentState).toBe('PENDING_ASSIGNMENT');
    }

    // Verify assignments were cancelled
    expect(uow.assignments.cancelledRouteIds).toContain('route-1');
    for (const asg of uow.assignments.assignments) {
      expect(asg.status).toBe('CANCELLED');
    }

    // Verify package status histories
    expect(uow.packages.recordedHistories).toHaveLength(3);
    expect(uow.packages.recordedHistories[0]).toMatchObject({
      previousState: 'ASSIGNED_TO_ROUTE',
      nextState: 'PENDING_ASSIGNMENT',
      reasonCode: 'OPERATIONAL_CHANGE',
      changedByUserId: 'user-coordinator',
    });

    // Verify audit log
    expect(uow.audit.logs).toHaveLength(1);
    expect(uow.audit.logs[0]).toMatchObject({
      tenantId: 'tenant-a',
      actorUserId: 'user-coordinator',
      action: 'ROUTE_CANCELLED',
      entityType: 'ROUTE',
      entityId: 'route-1',
      previousState: RouteState.PLANNED,
      newState: RouteState.CANCELLED,
      correlationId: 'corr-cancel-1',
      details: {
        reasonCode: 'OPERATIONAL_CHANGE',
        reason: 'Fleet rerouted to emergency sector',
        revertedPackagesCount: 3,
      },
    });

    // Verify outbox domain event
    expect(uow.outbox.recordedEvents).toHaveLength(1);
    expect(uow.outbox.recordedEvents[0]).toMatchObject({
      tenantId: 'tenant-a',
      correlationId: 'corr-cancel-1',
      eventType: 'RouteCancelled',
      payload: expect.objectContaining({
        routeId: 'route-1',
        fromState: RouteState.PLANNED,
        toState: RouteState.CANCELLED,
        reasonCode: 'OPERATIONAL_CHANGE',
      }),
    });
  });

  it('cancels READY route and reverts packages from READY_FOR_DISPATCH to PENDING_ASSIGNMENT', async () => {
    // Arrange
    const { useCase, uow } = createTestContext();
    seedRoute(uow, {
      state: RouteState.READY,
      packageCount: 2,
      packagesState: 'READY_FOR_DISPATCH',
    });
    const command = createCommand();

    // Act
    const result = await useCase.execute(command);

    // Assert
    expect(result.state).toBe(RouteState.CANCELLED);
    expect(result.updatedPackagesCount).toBe(2);

    for (const pkg of uow.packages.packages) {
      expect(pkg.currentState).toBe('PENDING_ASSIGNMENT');
    }

    expect(uow.packages.recordedHistories[0]).toMatchObject({
      previousState: 'READY_FOR_DISPATCH',
      nextState: 'PENDING_ASSIGNMENT',
    });

    expect(uow.audit.logs[0]?.previousState).toBe(RouteState.READY);
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
