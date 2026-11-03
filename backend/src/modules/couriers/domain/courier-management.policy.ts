import {
  CourierCommittedError,
  CourierUserNotEligibleError,
  CourierValidationError,
} from './courier-errors';

export type CourierStatus = 'ACTIVE' | 'INACTIVE';
export interface CourierSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly email: string;
  readonly userStatus: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  readonly status: CourierStatus;
  readonly activeAssignmentCount: number;
  readonly routes: readonly { id: string; state: string }[];
}

const closedStates = new Set(['COMPLETED', 'CANCELLED', 'PLANNING_FAILED']);
export function courierCommitment(snapshot: CourierSnapshot) {
  const activeRoutes = snapshot.routes.filter(
    (route) => !closedStates.has(route.state),
  );
  return {
    isCommitted: snapshot.activeAssignmentCount > 0 || activeRoutes.length > 0,
    activeRouteIds: activeRoutes.map((route) => route.id),
  };
}

export function courierId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(
      value.trim(),
    )
  )
    throw new CourierValidationError(
      'Courier id must be a valid UUID',
      'courierId',
    );
  return value.trim().toLowerCase();
}

export function courierStatusCommand(body: unknown): CourierStatus {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new CourierValidationError('Status is required', 'status');
  const record = body as Record<string, unknown>;
  const unknown = Object.keys(record).find((key) => key !== 'status');
  if (unknown) throw new CourierValidationError('Unknown field', unknown);
  if (record.status !== 'ACTIVE' && record.status !== 'INACTIVE')
    throw new CourierValidationError(
      'Status must be ACTIVE or INACTIVE',
      'status',
    );
  return record.status;
}

export function validateCourierStatus(
  snapshot: CourierSnapshot,
  status: CourierStatus,
): void {
  if (status === snapshot.status) return;
  if (status === 'INACTIVE' && courierCommitment(snapshot).isCommitted)
    throw new CourierCommittedError();
  if (status === 'ACTIVE' && snapshot.userStatus !== 'ACTIVE')
    throw new CourierUserNotEligibleError();
}
