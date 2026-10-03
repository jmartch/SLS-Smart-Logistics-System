import type { Coordinates } from '../coordinates';
import { calculateHaversineDistance } from '../haversine';
import type {
  OrderedRouteSequence,
  OrderedStop,
  StopCandidateInput,
  StopOrderingName,
} from '../models/stop-ordering.types';

export function calculateCircuitDistance(
  route: readonly StopCandidateInput[],
  origin: Coordinates,
): number {
  if (route.length === 0) {
    return 0;
  }

  let previous = origin;
  let cumulative = 0;

  for (let i = 0; i < route.length; i++) {
    cumulative += calculateHaversineDistance(previous, route[i].coordinates);
    previous = route[i].coordinates;
  }

  return cumulative + calculateHaversineDistance(previous, origin);
}

export function materializeRouteSequence(
  route: readonly StopCandidateInput[],
  origin: Coordinates,
  tenantId: string,
  algorithm: StopOrderingName,
  refinement: OrderedRouteSequence['refinement'] = null,
): OrderedRouteSequence {
  if (route.length === 0) {
    return Object.freeze({
      tenantId,
      origin,
      algorithm,
      algorithmVersion: '1' as const,
      stops: Object.freeze([]),
      distanceToLastStopMeters: 0,
      returnToOriginMeters: 0,
      totalDistanceMeters: 0,
      refinement: refinement ? Object.freeze(refinement) : null,
    });
  }

  let previous = origin;
  let cumulative = 0;
  const stops: OrderedStop[] = [];

  for (let i = 0; i < route.length; i++) {
    const candidate = route[i];
    const leg = calculateHaversineDistance(previous, candidate.coordinates);
    cumulative += leg;

    stops.push(
      Object.freeze({
        packageId: candidate.packageId,
        tenantId: candidate.tenantId,
        coordinates: candidate.coordinates,
        sequence: i + 1,
        distanceFromPreviousMeters: leg,
        cumulativeDistanceMeters: cumulative,
      }),
    );

    previous = candidate.coordinates;
  }

  const returnDistance = calculateHaversineDistance(previous, origin);
  const total = cumulative + returnDistance;

  return Object.freeze({
    tenantId,
    origin,
    algorithm,
    algorithmVersion: '1' as const,
    stops: Object.freeze(stops),
    distanceToLastStopMeters: cumulative,
    returnToOriginMeters: returnDistance,
    totalDistanceMeters: total,
    refinement: refinement ? Object.freeze(refinement) : null,
  });
}