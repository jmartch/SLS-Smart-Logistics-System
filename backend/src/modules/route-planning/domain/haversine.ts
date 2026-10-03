import type { Coordinates } from './coordinates';

export const EARTH_RADIUS_METERS = 6_371_000;

const DEGREES_TO_RADIANS = Math.PI / 180;

export function calculateHaversineDistance(
  from: Coordinates,
  to: Coordinates,
): number {
  const fromLatitude = from.latitude * DEGREES_TO_RADIANS;
  const toLatitude = to.latitude * DEGREES_TO_RADIANS;

  const deltaLatitude = (to.latitude - from.latitude) * DEGREES_TO_RADIANS;
  const deltaLongitude = (to.longitude - from.longitude) * DEGREES_TO_RADIANS;

  const sinHalfLatitude = Math.sin(deltaLatitude / 2);
  const sinHalfLongitude = Math.sin(deltaLongitude / 2);

  const a =
    sinHalfLatitude * sinHalfLatitude +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      sinHalfLongitude *
      sinHalfLongitude;

  // Clamping en [0, 1] previene NaN debido a imprecisión de punto flotante en antípodas/puntos idénticos
  const clampedA = Math.max(0, Math.min(1, a));

  const centralAngle =
    2 * Math.atan2(Math.sqrt(clampedA), Math.sqrt(1 - clampedA));

  return EARTH_RADIUS_METERS * centralAngle;
}

export function haversineMetersToKilometers(meters: number): number {
  return meters / 1_000;
}
