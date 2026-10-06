import {
    PackageEventType,
    type PackageStateChangedEvent,
    type PackageTransitionMetadata,
} from './events/package-state-changed.event';
import { InvalidPackageTransitionError } from './invalid-package-transition.error';
import { getPackageState, type PackageState } from './package-states';
import { PackageStatus, type PackageStateName } from './package-state.types';

export interface ReconstitutePackageProperties {
    readonly id: string;
    readonly tenantId: string;
    readonly state: PackageStateName;
}

export interface TransitionOptions {
    readonly actorUserId?: string;
    readonly correlationId?: string;
    readonly occurredAt?: Date;
}

export class PackageAggregate {
    private currentState: PackageState;
    private readonly domainEvents: PackageStateChangedEvent[] = [];

    private constructor(
        readonly id: string,
        readonly tenantId: string,
        initialState: PackageState,
    ) {
        this.currentState = initialState;
    }

    static reconstitute(
        properties: ReconstitutePackageProperties,
    ): PackageAggregate {
        return new PackageAggregate(
            properties.id,
            properties.tenantId,
            getPackageState(properties.state),
        );
    }

    get state(): PackageStateName {
        return this.currentState.status;
    }

    markClassified(options?: TransitionOptions): void {
        this.transitionTo(PackageStatus.CLASSIFIED, this.toMetadata(options));
    }

    markPendingAssignment(options?: TransitionOptions): void {
        this.transitionTo(
            PackageStatus.PENDING_ASSIGNMENT,
            this.toMetadata(options),
        );
    }

    assignToRoute(options?: TransitionOptions): void {
        this.transitionTo(
            PackageStatus.ASSIGNED_TO_ROUTE,
            this.toMetadata(options),
        );
    }

    prepareForDispatch(options?: TransitionOptions): void {
        this.transitionTo(
            PackageStatus.READY_FOR_DISPATCH,
            this.toMetadata(options),
        );
    }

    markInTransit(options?: TransitionOptions): void {
        this.transitionTo(PackageStatus.IN_TRANSIT, this.toMetadata(options));
    }

    markOutForDelivery(options?: TransitionOptions): void {
        this.transitionTo(
            PackageStatus.OUT_FOR_DELIVERY,
            this.toMetadata(options),
        );
    }

    deliver(options?: TransitionOptions): void {
        this.transitionTo(PackageStatus.DELIVERED, this.toMetadata(options));
    }

    failDelivery(reasonCode: string, options?: TransitionOptions): void {
        this.transitionTo(PackageStatus.DELIVERY_FAILED, {
            ...this.toMetadata(options),
            reasonCode,
        });
    }

    reschedule(reasonCode: string, options?: TransitionOptions): void {
        this.transitionTo(PackageStatus.RESCHEDULED, {
            ...this.toMetadata(options),
            reasonCode,
        });
    }

    requestReturn(reasonCode: string, options?: TransitionOptions): void {
        this.transitionTo(PackageStatus.RETURN_PENDING, {
            ...this.toMetadata(options),
            reasonCode,
        });
    }

    returnToDepot(options?: TransitionOptions): void {
        this.transitionTo(PackageStatus.RETURNED, this.toMetadata(options));
    }

    cancel(reasonCode?: string, options?: TransitionOptions): void {
        this.transitionTo(PackageStatus.CANCELLED, {
            ...this.toMetadata(options),
            reasonCode,
        });
    }

    transitionTo(
        targetState: PackageStateName,
        metadata: PackageTransitionMetadata = {},
    ): void {
        const fromState = this.currentState.status;

        if (!this.currentState.canTransitionTo(targetState)) {
            throw new InvalidPackageTransitionError(fromState, targetState);
        }

        this.currentState = getPackageState(targetState);
        this.domainEvents.push({
            aggregateId: this.id,
            tenantId: this.tenantId,
            eventType: PackageEventType[targetState],
            version: 1,
            occurredAt: metadata.occurredAt ?? new Date(),
            fromState,
            toState: targetState,
            changedByUserId: metadata.changedByUserId,
            reasonCode: metadata.reasonCode,
            correlationId: metadata.correlationId,
        });
    }

    pullDomainEvents(): readonly PackageStateChangedEvent[] {
        const pendingEvents = [...this.domainEvents];
        this.domainEvents.length = 0;
        return pendingEvents;
    }

    private toMetadata(options?: TransitionOptions): PackageTransitionMetadata {
        return {
            changedByUserId: options?.actorUserId,
            correlationId: options?.correlationId,
            occurredAt: options?.occurredAt,
        };
    }
}
