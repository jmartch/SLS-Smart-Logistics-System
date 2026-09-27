import type { PackageState } from './package-state';
import {
    PackageStatus,
    type PackageStateName,
} from './package-state.types';
import { AssignedToRouteState } from './states/assigned-to-route.state';
import { CancelledState } from './states/cancelled.state';
import { ClassifiedState } from './states/classified.state';
import { DeliveredState } from './states/delivered.state';
import { DeliveryFailedState } from './states/delivery-failed.state';
import { InTransitState } from './states/in-transit.state';
import { OutForDeliveryState } from './states/out-for-delivery.state';
import { PendingAssignmentState } from './states/pending-assignment.state';
import { ReadyForDispatchState } from './states/ready-for-dispatch.state';
import { RegisteredState } from './states/registered.state';
import { RescheduledState } from './states/rescheduled.state';
import { ReturnedState } from './states/returned.state';
import { ReturnPendingState } from './states/return-pending.state';

export function createPackageState(
    stateName: PackageStateName,
): PackageState {
    switch (stateName) {
        case PackageStatus.REGISTERED:
            return new RegisteredState();
        case PackageStatus.CLASSIFIED:
            return new ClassifiedState();
        case PackageStatus.PENDING_ASSIGNMENT:
            return new PendingAssignmentState();
        case PackageStatus.ASSIGNED_TO_ROUTE:
            return new AssignedToRouteState();
        case PackageStatus.READY_FOR_DISPATCH:
            return new ReadyForDispatchState();
        case PackageStatus.IN_TRANSIT:
            return new InTransitState();
        case PackageStatus.OUT_FOR_DELIVERY:
            return new OutForDeliveryState();
        case PackageStatus.DELIVERED:
            return new DeliveredState();
        case PackageStatus.DELIVERY_FAILED:
            return new DeliveryFailedState();
        case PackageStatus.RESCHEDULED:
            return new RescheduledState();
        case PackageStatus.RETURN_PENDING:
            return new ReturnPendingState();
        case PackageStatus.RETURNED:
            return new ReturnedState();
        case PackageStatus.CANCELLED:
            return new CancelledState();
        default: {
            const exhaustiveState: never = stateName;
            throw new Error(`Unsupported package state: ${exhaustiveState}`);
        }
    }
}