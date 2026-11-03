import { GetRouteDetailUseCase } from '../application/use-cases/get-route-detail.use-case';
import { Route } from '../domain/route';
import { RouteStop } from '../domain/route-stop';
import { RouteState } from '../domain/route-state';
import { RouteStopState } from '../domain/route-stop-state';
import {
  RouteForbiddenError,
  RouteNotFoundError,
} from '../domain/route-errors';
import {
  createRoutePropsFixture,
  createValidStopsFixture,
} from './fixtures/route.fixtures';
import {
  InMemoryRouteRepository,
  FakeRouteAccessPort,
} from './fixtures/route-use-case.doubles';
import { GetRouteDetailQuery } from '../application/ports/route-contracts';

function createTestContext() {
  const repository = new InMemoryRouteRepository();
  const accessPort = new FakeRouteAccessPort();
  const useCase = new GetRouteDetailUseCase(repository, accessPort);

  return { repository, accessPort, useCase };
}

function createQuery(
  overrides?: Partial<GetRouteDetailQuery>,
): GetRouteDetailQuery {
  return {
    tenantId: overrides?.tenantId ?? 'tenant-a',
    routeId: overrides?.routeId ?? 'route-1',
    actorUserId: overrides?.actorUserId ?? 'user-coordinator',
    correlationId: overrides?.correlationId ?? 'corr-detail-1',
  };
}

describe('GetRouteDetailUseCase', () => {
  it('rejects when route is not found', async () => {
    // Arrange
    const { useCase } = createTestContext();
    const query = createQuery({ routeId: 'non-existent' });

    // Act
    const act = () => useCase.execute(query);

    // Assert
    await expect(act).rejects.toThrow(RouteNotFoundError);
  });

  it('rejects when actor is not authorized to view the route', async () => {
    // Arrange
    const { useCase, repository, accessPort } = createTestContext();
    const route = new Route(
      createRoutePropsFixture({
        id: 'route-1',
        tenantId: 'tenant-a',
        courierId: 'courier-1',
        stops: createValidStopsFixture(2),
      }),
    );
    repository.seed(route);
    accessPort.canView = false;
    const query = createQuery();

    // Act
    const act = () => useCase.execute(query);

    // Assert
    await expect(act).rejects.toThrow(RouteForbiddenError);
  });

  it('returns structured route detail with ordered stops via GoF iterator', async () => {
    // Arrange
    const { useCase, repository } = createTestContext();
    const plannedStart = new Date('2026-10-06T08:00:00Z');
    const plannedEnd = new Date('2026-10-06T12:00:00Z');
    const stops = createValidStopsFixture(3, 'tenant-a', 'route-1');

    const route = new Route(
      createRoutePropsFixture({
        id: 'route-1',
        tenantId: 'tenant-a',
        state: RouteState.READY,
        vehicleId: 'vehicle-1',
        courierId: 'courier-1',
        depotId: 'depot-1',
        plannedStartAt: plannedStart,
        plannedEndAt: plannedEnd,
        stops,
      }),
    );
    repository.seed(route);
    const query = createQuery();

    // Act
    const result = await useCase.execute(query);

    // Assert
    expect(result).toMatchObject({
      id: 'route-1',
      tenantId: 'tenant-a',
      state: RouteState.READY,
      vehicleId: 'vehicle-1',
      courierId: 'courier-1',
      depotId: 'depot-1',
      plannedStartAt: plannedStart.toISOString(),
      plannedEndAt: plannedEnd.toISOString(),
      startedAt: null,
      completedAt: null,
    });

    expect(result.stops).toHaveLength(3);
    expect(result.stops[0]).toEqual({
      id: stops[0]?.id,
      stopNumber: 1,
      latitude: stops[0]?.latitude,
      longitude: stops[0]?.longitude,
      state: RouteStopState.PENDING,
    });
    expect(result.stops[1]?.stopNumber).toBe(2);
    expect(result.stops[2]?.stopNumber).toBe(3);
    expect(Object.isFrozen(result.stops)).toBe(true);
  });

  it('handles formatted timestamps for started and completed routes', async () => {
    // Arrange
    const { useCase, repository } = createTestContext();
    const startedAt = new Date('2026-10-06T08:15:00Z');
    const completedAt = new Date('2026-10-06T11:45:00Z');

    const route = new Route(
      createRoutePropsFixture({
        id: 'route-done',
        tenantId: 'tenant-a',
        state: RouteState.COMPLETED,
        startedAt,
        completedAt,
        stops: createValidStopsFixture(1, 'tenant-a', 'route-done'),
      }),
    );
    repository.seed(route);
    const query = createQuery({ routeId: 'route-done' });

    // Act
    const result = await useCase.execute(query);

    // Assert
    expect(result.startedAt).toBe(startedAt.toISOString());
    expect(result.completedAt).toBe(completedAt.toISOString());
  });

  it('returns enriched vehicle, courier, depot, zone, and stop package details when available', async () => {
    // Arrange
    const { useCase, repository } = createTestContext();
    const stopWithPkg = new RouteStop({
      id: 'stop-pkg-1',
      tenantId: 'tenant-a',
      routeId: 'route-enriched',
      stopNumber: 1,
      latitude: 10.9878,
      longitude: -74.7889,
      state: RouteStopState.PENDING,
      packageId: 'pkg-123',
      trackingCode: 'TRK-99999',
      address: 'Carrera 43 # 80-120, Barranquilla',
    });

    const route = new Route(
      createRoutePropsFixture({
        id: 'route-enriched',
        tenantId: 'tenant-a',
        state: RouteState.READY,
        vehicleId: 'veh-1',
        courierId: 'courier-1',
        vehiclePlate: 'COL-123',
        courierEmail: 'courier@logistics.com',
        depotName: 'Depósito Central',
        zoneId: 'zone-north',
        zoneName: 'Zona Norte',
        stops: [stopWithPkg],
      }),
    );
    repository.seed(route);
    const query = createQuery({ routeId: 'route-enriched' });

    // Act
    const result = await useCase.execute(query);

    // Assert
    expect(result.vehiclePlate).toBe('COL-123');
    expect(result.courierEmail).toBe('courier@logistics.com');
    expect(result.depotName).toBe('Depósito Central');
    expect(result.zoneId).toBe('zone-north');
    expect(result.zoneName).toBe('Zona Norte');
    expect(result.stops[0]).toEqual({
      id: 'stop-pkg-1',
      stopNumber: 1,
      latitude: 10.9878,
      longitude: -74.7889,
      state: RouteStopState.PENDING,
      packageId: 'pkg-123',
      trackingCode: 'TRK-99999',
      address: 'Carrera 43 # 80-120, Barranquilla',
    });
  });
});
