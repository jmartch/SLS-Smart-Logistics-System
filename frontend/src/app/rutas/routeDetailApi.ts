import type { Stop } from '../../mockData';
import { apiFetch } from '../../shared/api/httpClient';
import {
  isValidCoordinate,
  type RouteMapStop,
  type RouteStopState,
} from './RouteMap';

export interface BackendRouteStopDto {
  readonly id: string;
  readonly stopNumber: number;
  readonly latitude: number;
  readonly longitude: number;
  readonly state: RouteStopState;
}

export interface BackendRouteDetailDto {
  readonly id: string;
  readonly tenantId: string;
  readonly state: string;
  readonly vehicleId: string;
  readonly courierId: string;
  readonly depotId?: string | null;
  readonly plannedStartAt?: string | null;
  readonly plannedEndAt?: string | null;
  readonly startedAt?: string | null;
  readonly completedAt?: string | null;
  readonly stops: readonly BackendRouteStopDto[];
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidRouteId(routeId: string | undefined): boolean {
  return typeof routeId === 'string' && UUID_REGEX.test(routeId.trim());
}

export function mapFixtureStopStatusToState(
  status: Stop['status'],
): RouteStopState {
  if (status === 'delivered') {
    return 'COMPLETED';
  }
  if (status === 'failed') {
    return 'FAILED';
  }
  return 'PENDING';
}

export function mapFixtureStopsToRouteMapStops(
  stops: readonly Stop[],
): RouteMapStop[] {
  return stops
    .filter((stop) => isValidCoordinate(stop.latitude, stop.longitude))
    .map((stop) => ({
      id: stop.id,
      stopNumber: stop.order,
      latitude: stop.latitude as number,
      longitude: stop.longitude as number,
      state: mapFixtureStopStatusToState(stop.status),
      label: stop.recipient,
      address: stop.address,
      trackingCode: stop.trackingCode,
    }))
    .sort((a, b) => a.stopNumber - b.stopNumber);
}

export function mapBackendStopsToRouteMapStops(
  backendStops: readonly BackendRouteStopDto[],
  fixtureStops: readonly Stop[] = [],
): RouteMapStop[] {
  const fixtureByOrder = new Map<number, Stop>();
  const fixtureById = new Map<string, Stop>();
  for (const fixtureStop of fixtureStops) {
    fixtureByOrder.set(fixtureStop.order, fixtureStop);
    fixtureById.set(fixtureStop.id, fixtureStop);
  }

  return backendStops
    .filter((stop) => isValidCoordinate(stop.latitude, stop.longitude))
    .map((stop) => {
      const matched =
        fixtureById.get(stop.id) ?? fixtureByOrder.get(stop.stopNumber);
      return {
        id: stop.id,
        stopNumber: stop.stopNumber,
        latitude: stop.latitude,
        longitude: stop.longitude,
        state: stop.state,
        label: matched?.recipient,
        address: matched?.address,
        trackingCode: matched?.trackingCode,
      };
    })
    .sort((a, b) => a.stopNumber - b.stopNumber);
}

export async function fetchRouteDetailFromBackend(
  routeId: string,
): Promise<BackendRouteDetailDto | null> {
  if (!isUuidRouteId(routeId)) {
    return null;
  }

  const payload = await apiFetch<BackendRouteDetailDto>(`/routes/${routeId}`, {
    method: 'GET',
  });

  if (
    !payload ||
    typeof payload !== 'object' ||
    !Array.isArray((payload as { stops?: unknown }).stops)
  ) {
    throw new Error('La respuesta de detalle de ruta no contiene paradas válidas.');
  }

  return payload;
}
