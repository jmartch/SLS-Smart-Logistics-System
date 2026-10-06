import { RouteProps } from '../../domain/route';
import { RouteState } from '../../domain/route-state';
import { RouteStop, RouteStopProps } from '../../domain/route-stop';
import { RouteStopState } from '../../domain/route-stop-state';

export function createRouteStopFixture(
  overrides?: Partial<RouteStopProps>,
): RouteStop {
  const props: RouteStopProps = {
    id: overrides?.id ?? 'stop-1',
    tenantId: overrides?.tenantId ?? 'tenant-a',
    routeId: overrides?.routeId ?? 'route-1',
    stopNumber: overrides?.stopNumber ?? 1,
    latitude: overrides?.latitude ?? 10.9878,
    longitude: overrides?.longitude ?? -74.7889,
    state: overrides?.state ?? RouteStopState.PENDING,
  };
  return new RouteStop(props);
}

export function createValidStopsFixture(
  count: number,
  tenantId = 'tenant-a',
  routeId = 'route-1',
): RouteStop[] {
  const stops: RouteStop[] = [];
  for (let i = 1; i <= count; i++) {
    stops.push(
      createRouteStopFixture({
        id: `stop-${i}`,
        tenantId,
        routeId,
        stopNumber: i,
        latitude: 10.98 + i * 0.001,
        longitude: -74.78 - i * 0.001,
        state: RouteStopState.PENDING,
      }),
    );
  }
  return stops;
}

export function createRoutePropsFixture(
  overrides?: Partial<RouteProps>,
): RouteProps {
  const tenantId = overrides?.tenantId ?? 'tenant-a';
  const id = overrides?.id ?? 'route-1';
  return {
    id,
    tenantId,
    planningRequestId: overrides?.planningRequestId ?? 'plan-req-1',
    vehicleId: overrides?.vehicleId ?? 'vehicle-1',
    courierId: overrides?.courierId ?? 'courier-1',
    depotId: overrides?.depotId !== undefined ? overrides.depotId : 'depot-1',
    state: overrides?.state ?? RouteState.PLANNED,
    plannedAt: overrides?.plannedAt ?? new Date('2026-10-06T08:00:00Z'),
    startedAt: overrides?.startedAt ?? null,
    completedAt: overrides?.completedAt ?? null,
    plannedStartAt:
      overrides?.plannedStartAt ?? new Date('2026-10-06T09:00:00Z'),
    plannedEndAt: overrides?.plannedEndAt ?? new Date('2026-10-06T17:00:00Z'),
    stops: overrides?.stops ?? createValidStopsFixture(3, tenantId, id),
  };
}
