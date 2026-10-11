export const RouteState = {
  DRAFT: 'DRAFT',
  PLANNING: 'PLANNING',
  PLANNED: 'PLANNED',
  READY: 'READY',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  PLANNING_FAILED: 'PLANNING_FAILED',
  INTERRUPTED: 'INTERRUPTED',
  CANCELLED: 'CANCELLED',
} as const;

export type RouteState = (typeof RouteState)[keyof typeof RouteState];

export function isRouteState(value: unknown): value is RouteState {
  return (
    typeof value === 'string' &&
    Object.values(RouteState).includes(value as RouteState)
  );
}
