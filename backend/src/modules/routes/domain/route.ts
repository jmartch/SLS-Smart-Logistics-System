import { randomUUID } from 'crypto';
import { RouteState } from './route-state';
import { RouteStop } from './route-stop';
import {
    RouteDomainEvent,
    RouteEventType,
    RouteStartedEvent,
    RoutePreparedEvent,
    RouteCancelledEvent,
    RouteInterruptedEvent,
    RouteCompletedEvent,
} from './events/route-lifecycle.event';
import {
    RouteStateConflictError,
    RouteManifestInvalidError,
    RouteValidationError,
} from './route-errors';
import { RouteStopIterator } from './route-stop-iterator/route-stop-iterator';
import { OrderedRouteStopIterator } from './route-stop-iterator/ordered-route-stop.iterator';
import { PendingRouteStopIterator } from './route-stop-iterator/pending-route-stop.iterator';
import { FailedRouteStopIterator } from './route-stop-iterator/failed-route-stop.iterator';
import { RouteClosureMode } from './route-closure.types';
import { RouteClosureSummary } from './route-closure-summary';

export interface RouteProps {
    readonly id: string;
    readonly tenantId: string;
    readonly planningRequestId: string;
    readonly vehicleId: string;
    readonly courierId: string;
    readonly depotId?: string | null;
    readonly state: RouteState;
    readonly plannedAt: Date;
    readonly startedAt?: Date | null;
    readonly completedAt?: Date | null;
    readonly plannedStartAt?: Date | null;
    readonly plannedEndAt?: Date | null;
    readonly stops: readonly RouteStop[];
    readonly dispatchManifestSnapshot?: unknown | null;
}

export class Route {
    private _state: RouteState;
    private _startedAt?: Date | null;
    private _completedAt?: Date | null;
    private _dispatchManifestSnapshot?: unknown | null;
    private readonly _stops: readonly RouteStop[];
    private readonly _domainEvents: RouteDomainEvent[] = [];

    constructor(private readonly props: RouteProps) {
        this._state = props.state;
        this._startedAt = props.startedAt;
        this._completedAt = props.completedAt;
        this._dispatchManifestSnapshot = props.dispatchManifestSnapshot;

        this.validateStops(props.stops, props.tenantId, props.id);

        this._stops = Object.freeze(
            [...props.stops].sort((a, b) => a.stopNumber - b.stopNumber),
        );
        Object.freeze(this.props);
    }

    get id(): string {
        return this.props.id;
    }

    get tenantId(): string {
        return this.props.tenantId;
    }

    get planningRequestId(): string {
        return this.props.planningRequestId;
    }

    get vehicleId(): string {
        return this.props.vehicleId;
    }

    get courierId(): string {
        return this.props.courierId;
    }

    get depotId(): string | null | undefined {
        return this.props.depotId;
    }

    get state(): RouteState {
        return this._state;
    }

    get plannedAt(): Date {
        return this.props.plannedAt;
    }

    get startedAt(): Date | null | undefined {
        return this._startedAt;
    }

    get completedAt(): Date | null | undefined {
        return this._completedAt;
    }

    get plannedStartAt(): Date | null | undefined {
        return this.props.plannedStartAt;
    }

    get plannedEndAt(): Date | null | undefined {
        return this.props.plannedEndAt;
    }

    get stops(): readonly RouteStop[] {
        return this._stops;
    }

    get dispatchManifestSnapshot(): unknown | null | undefined {
        return this._dispatchManifestSnapshot;
    }

    pullDomainEvents(): readonly RouteDomainEvent[] {
        const events = [...this._domainEvents];
        this._domainEvents.length = 0;
        return Object.freeze(events);
    }

    createIterator(): RouteStopIterator {
        return new OrderedRouteStopIterator(this._stops);
    }

    createPendingIterator(): RouteStopIterator {
        return new PendingRouteStopIterator(this._stops);
    }

    createFailedIterator(): RouteStopIterator {
        return new FailedRouteStopIterator(this._stops);
    }

    prepare(options?: {
        eventId?: string;
        actorUserId?: string;
        correlationId?: string;
        manifestSnapshot?: unknown | null;
    }): void {
        if (this._state !== RouteState.PLANNED) {
            throw new RouteStateConflictError(this.id, this._state, 'prepare');
        }

        if (this._stops.length === 0) {
            throw new RouteManifestInvalidError(
                'Cannot prepare an empty route with zero stops',
            );
        }

        if (options?.manifestSnapshot !== undefined) {
            this._dispatchManifestSnapshot = options.manifestSnapshot;
        }

        this._state = RouteState.READY;

        const event: RoutePreparedEvent = {
            eventId: options?.eventId ?? randomUUID(),
            tenantId: this.tenantId,
            routeId: this.id,
            eventType: RouteEventType.PREPARED,
            version: 1,
            occurredAt: new Date(),
            producer: 'routes',
            fromState: RouteState.PLANNED,
            toState: RouteState.READY,
            vehicleId: this.vehicleId,
            courierId: this.courierId,
            depotId: this.depotId,
            packageCount: this._stops.length,
            metadata: {
                actorUserId: options?.actorUserId,
                correlationId: options?.correlationId,
            },
        };

        this._domainEvents.push(event);
    }

    start(options?: {
        now?: Date;
        eventId?: string;
        actorUserId?: string;
        correlationId?: string;
    }): void {
        if (this._state !== RouteState.READY) {
            throw new RouteStateConflictError(this.id, this._state, 'start');
        }

        const startTimestamp = options?.now ?? new Date();
        this._state = RouteState.IN_PROGRESS;
        this._startedAt = startTimestamp;

        const event: RouteStartedEvent = {
            eventId: options?.eventId ?? randomUUID(),
            tenantId: this.tenantId,
            routeId: this.id,
            eventType: RouteEventType.STARTED,
            version: 1,
            occurredAt: startTimestamp,
            producer: 'routes',
            fromState: RouteState.READY,
            toState: RouteState.IN_PROGRESS,
            vehicleId: this.vehicleId,
            courierId: this.courierId,
            depotId: this.depotId,
            packageCount: this._stops.length,
            startedAt: startTimestamp,
            metadata: {
                actorUserId: options?.actorUserId,
                correlationId: options?.correlationId,
            },
        };
        this._domainEvents.push(event);
    }

    cancel(
        reasonCode: string,
        reason?: string,
        options?: {
            eventId?: string;
            actorUserId?: string;
            correlationId?: string;
        },
    ): void {
        if (
            this._state !== RouteState.PLANNED &&
            this._state !== RouteState.READY
        ) {
            throw new RouteStateConflictError(this.id, this._state, 'cancel');
        }
        if (!reasonCode || !reasonCode.trim()) {
            throw new RouteValidationError('Cancellation reasonCode is mandatory');
        }
        const previousState = this._state;
        this._state = RouteState.CANCELLED;
        const event: RouteCancelledEvent = {
            eventId: options?.eventId ?? randomUUID(),
            tenantId: this.tenantId,
            routeId: this.id,
            eventType: RouteEventType.CANCELLED,
            version: 1,
            occurredAt: new Date(),
            producer: 'routes',
            fromState: previousState,
            toState: RouteState.CANCELLED,
            vehicleId: this.vehicleId,
            courierId: this.courierId,
            depotId: this.depotId,
            packageCount: this._stops.length,
            reasonCode,
            reason,
            metadata: {
                actorUserId: options?.actorUserId,
                correlationId: options?.correlationId,
                reasonCode,
                reason,
            },
        };
        this._domainEvents.push(event);
    }

    interrupt(
        reasonCode: string,
        reason?: string,
        options?: {
            eventId?: string;
            actorUserId?: string;
            correlationId?: string;
        },
    ): void {
        if (this._state !== RouteState.IN_PROGRESS) {
            throw new RouteStateConflictError(this.id, this._state, 'interrupt');
        }
        if (!reasonCode || !reasonCode.trim()) {
            throw new RouteValidationError('Interruption reasonCode is mandatory');
        }
        this._state = RouteState.INTERRUPTED;
        const event: RouteInterruptedEvent = {
            eventId: options?.eventId ?? randomUUID(),
            tenantId: this.tenantId,
            routeId: this.id,
            eventType: RouteEventType.INTERRUPTED,
            version: 1,
            occurredAt: new Date(),
            producer: 'routes',
            fromState: RouteState.IN_PROGRESS,
            toState: RouteState.INTERRUPTED,
            vehicleId: this.vehicleId,
            courierId: this.courierId,
            depotId: this.depotId,
            packageCount: this._stops.length,
            reasonCode,
            reason,
            metadata: {
                actorUserId: options?.actorUserId,
                correlationId: options?.correlationId,
                reasonCode,
                reason,
            },
        };
        this._domainEvents.push(event);
    }

    complete(
        summary: RouteClosureSummary,
        options?: {
            eventId?: string;
            actorUserId?: string;
            correlationId?: string;
        },
    ): void {
        if (
            this._state !== RouteState.IN_PROGRESS &&
            this._state !== RouteState.INTERRUPTED
        ) {
            throw new RouteStateConflictError(this.id, this._state, 'complete');
        }

        if (!this._startedAt) {
            throw new RouteValidationError(
                'Route cannot be completed without a startedAt timestamp',
            );
        }

        if (summary.routeId !== this.id) {
            throw new RouteValidationError(
                `Summary routeId '${summary.routeId}' does not match route id '${this.id}'`,
            );
        }

        if (summary.tenantId !== this.tenantId) {
            throw new RouteValidationError(
                `Summary tenantId '${summary.tenantId}' does not match route tenantId '${this.tenantId}'`,
            );
        }

        const previousState = this._state;
        this._state = RouteState.COMPLETED;
        this._completedAt = summary.completedAt;

        const event: RouteCompletedEvent = {
            eventId: options?.eventId ?? randomUUID(),
            tenantId: this.tenantId,
            routeId: this.id,
            eventType: RouteEventType.COMPLETED,
            version: 1,
            occurredAt: summary.completedAt,
            producer: 'routes',
            fromState: previousState,
            toState: RouteState.COMPLETED,
            vehicleId: this.vehicleId,
            courierId: this.courierId,
            depotId: this.depotId,
            packageCount: summary.totalAssigned,
            closureId: summary.closureId,
            mode: summary.mode,
            completedAt: summary.completedAt,
            summaryVersion: 1,
            totalAssigned: summary.totalAssigned,
            deliveredCount: summary.deliveredCount,
            failedCount: summary.failedCount,
            rescheduledCount: summary.rescheduledCount,
            returnedCount: summary.returnedCount,
            pendingCount: summary.pendingCount,
            metadata: {
                actorUserId: options?.actorUserId ?? summary.actorUserId,
                correlationId: options?.correlationId ?? summary.correlationId ?? undefined,
                reasonCode: summary.reasonCode ?? undefined,
                reason: summary.notes ?? undefined,
            },
        };

        this._domainEvents.push(event);
    }

    private validateStops(
        stops: readonly RouteStop[],
        tenantId: string,
        routeId: string,
    ): void {
        if (stops.length === 0) return;
        const sorted = [...stops].sort((a, b) => a.stopNumber - b.stopNumber);
        let expectedStopNumber = 1;
        for (const stop of sorted) {
            if (stop.tenantId !== tenantId) {
                throw new RouteManifestInvalidError(
                    `Stop '${stop.id}' has tenant '${stop.tenantId}' which does not match route tenant '${tenantId}'`,
                );
            }
            if (stop.routeId !== routeId) {
                throw new RouteManifestInvalidError(
                    `Stop '${stop.id}' belongs to route '${stop.routeId}' instead of '${routeId}'`,
                );
            }
            if (stop.stopNumber !== expectedStopNumber) {
                throw new RouteManifestInvalidError(
                    `Stops must form a continuous sequence from 1 to N without duplicates or gaps. Expected ${expectedStopNumber}, found ${stop.stopNumber}`,
                );
            }
            expectedStopNumber++;
        }
    }
}
