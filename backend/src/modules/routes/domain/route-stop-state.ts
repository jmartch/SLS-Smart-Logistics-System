export const RouteStopState = {
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;

export type RouteStopState =
  (typeof RouteStopState)[keyof typeof RouteStopState];

export function isRouteStopState(value: unknown): value is RouteStopState {
  return (
    typeof value === 'string' &&
    Object.values(RouteStopState).includes(value as RouteStopState)
  );
}
