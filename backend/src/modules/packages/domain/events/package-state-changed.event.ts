import type { PackageStateName } from '../package-state.types';

export const PackageEventType = {
    REGISTERED: 'PackageRegistered',
    CLASSIFIED: 'PackageClassified',
    PENDING_ASSIGNMENT: 'PackagePendingAssignment',
    ASSIGNED_TO_ROUTE: 'PackageAssigned',
    READY_FOR_DISPATCH: 'PackageReadyForDispatch',
    IN_TRANSIT: 'PackageInTransit',
    OUT_FOR_DELIVERY: 'PackageOutForDelivery',
    DELIVERED: 'PackageDelivered',
    DELIVERY_FAILED: 'DeliveryFailed',
    RESCHEDULED: 'PackageRescheduled',
    RETURN_PENDING: 'PackageReturnPending',
    RETURNED: 'PackageReturned',
    CANCELLED: 'PackageCancelled',
} as const satisfies Record<PackageStateName, string>;

export type PackageEventTypeName = (typeof PackageEventType)[PackageStateName];

export interface PackageTransitionMetadata {
    readonly changedByUserId?: string;
    readonly reasonCode?: string;
    readonly correlationId?: string;
}

export interface PackageStateChangedEvent {
    readonly aggregateId: string;
    readonly tenantId: string;
    readonly eventType: PackageEventTypeName;
    readonly version: 1;
    readonly occurredAt: Date;
    readonly fromState: PackageStateName;
    readonly toState: PackageStateName;
    readonly changedByUserId?: string;
    readonly reasonCode?: string;
    readonly correlationId?: string;
}
