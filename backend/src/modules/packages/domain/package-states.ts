import { PackageStatus, type PackageStateName } from './package-state.types';

export interface PackageState {
    readonly status: PackageStateName;
    canTransitionTo(targetState: PackageStateName): boolean;
}

export abstract class BasePackageState implements PackageState {
    abstract readonly status: PackageStateName;
    protected abstract readonly allowedTransitions: readonly PackageStateName[];

    canTransitionTo(targetState: PackageStateName): boolean {
        return this.allowedTransitions.includes(targetState);
    }
}

export class RegisteredState extends BasePackageState {
    readonly status = PackageStatus.REGISTERED;
    protected readonly allowedTransitions = [
        PackageStatus.CLASSIFIED,
        PackageStatus.CANCELLED,
    ] as const;
}

export class ClassifiedState extends BasePackageState {
    readonly status = PackageStatus.CLASSIFIED;
    protected readonly allowedTransitions = [
        PackageStatus.PENDING_ASSIGNMENT,
        PackageStatus.ASSIGNED_TO_ROUTE,
        PackageStatus.CANCELLED,
    ] as const;
}

export class PendingAssignmentState extends BasePackageState {
    readonly status = PackageStatus.PENDING_ASSIGNMENT;
    protected readonly allowedTransitions = [
        PackageStatus.ASSIGNED_TO_ROUTE,
        PackageStatus.CANCELLED,
    ] as const;
}

export class AssignedToRouteState extends BasePackageState {
    readonly status = PackageStatus.ASSIGNED_TO_ROUTE;
    protected readonly allowedTransitions = [
        PackageStatus.READY_FOR_DISPATCH,
        PackageStatus.PENDING_ASSIGNMENT,
        PackageStatus.CANCELLED,
    ] as const;
}

export class ReadyForDispatchState extends BasePackageState {
    readonly status = PackageStatus.READY_FOR_DISPATCH;
    protected readonly allowedTransitions = [
        PackageStatus.IN_TRANSIT,
        PackageStatus.PENDING_ASSIGNMENT,
        PackageStatus.CANCELLED,
    ] as const;
}

export class InTransitState extends BasePackageState {
    readonly status = PackageStatus.IN_TRANSIT;
    protected readonly allowedTransitions = [
        PackageStatus.OUT_FOR_DELIVERY,
    ] as const;
}

export class OutForDeliveryState extends BasePackageState {
    readonly status = PackageStatus.OUT_FOR_DELIVERY;
    protected readonly allowedTransitions = [
        PackageStatus.DELIVERED,
        PackageStatus.DELIVERY_FAILED,
    ] as const;
}

export class DeliveredState extends BasePackageState {
    readonly status = PackageStatus.DELIVERED;
    protected readonly allowedTransitions = [] as const;
}

export class DeliveryFailedState extends BasePackageState {
    readonly status = PackageStatus.DELIVERY_FAILED;
    protected readonly allowedTransitions = [
        PackageStatus.RESCHEDULED,
        PackageStatus.RETURN_PENDING,
    ] as const;
}

export class RescheduledState extends BasePackageState {
    readonly status = PackageStatus.RESCHEDULED;
    protected readonly allowedTransitions = [
        PackageStatus.ASSIGNED_TO_ROUTE,
        PackageStatus.CANCELLED,
    ] as const;
}

export class ReturnPendingState extends BasePackageState {
    readonly status = PackageStatus.RETURN_PENDING;
    protected readonly allowedTransitions = [PackageStatus.RETURNED] as const;
}

export class ReturnedState extends BasePackageState {
    readonly status = PackageStatus.RETURNED;
    protected readonly allowedTransitions = [] as const;
}

export class CancelledState extends BasePackageState {
    readonly status = PackageStatus.CANCELLED;
    protected readonly allowedTransitions = [] as const;
}

const PACKAGE_STATE_INSTANCES: Record<PackageStateName, PackageState> = {
    [PackageStatus.REGISTERED]: new RegisteredState(),
    [PackageStatus.CLASSIFIED]: new ClassifiedState(),
    [PackageStatus.PENDING_ASSIGNMENT]: new PendingAssignmentState(),
    [PackageStatus.ASSIGNED_TO_ROUTE]: new AssignedToRouteState(),
    [PackageStatus.READY_FOR_DISPATCH]: new ReadyForDispatchState(),
    [PackageStatus.IN_TRANSIT]: new InTransitState(),
    [PackageStatus.OUT_FOR_DELIVERY]: new OutForDeliveryState(),
    [PackageStatus.DELIVERED]: new DeliveredState(),
    [PackageStatus.DELIVERY_FAILED]: new DeliveryFailedState(),
    [PackageStatus.RESCHEDULED]: new RescheduledState(),
    [PackageStatus.RETURN_PENDING]: new ReturnPendingState(),
    [PackageStatus.RETURNED]: new ReturnedState(),
    [PackageStatus.CANCELLED]: new CancelledState(),
};

export function getPackageState(stateName: PackageStateName): PackageState {
    const state = PACKAGE_STATE_INSTANCES[stateName];
    if (!state) {
        throw new Error(`Unsupported package state: ${String(stateName)}`);
    }
    return state;
}
