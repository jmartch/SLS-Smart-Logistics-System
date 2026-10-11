import { RouteState } from '../route-state';

export const RouteEventType = {
  PREPARED: 'RoutePrepared',
  STARTED: 'RouteStarted',
  CANCELLED: 'RouteCancelled',
  INTERRUPTED: 'RouteInterrupted',
  COMPLETED: 'RouteCompleted',
} as const;

export type RouteEventType =
  (typeof RouteEventType)[keyof typeof RouteEventType];

export interface RouteEventMetadata {
  readonly actorUserId?: string;
  readonly correlationId?: string;
  readonly reasonCode?: string;
  readonly reason?: string;
}

export interface RouteDomainEventBase {
  readonly eventId: string;
  readonly tenantId: string;
  readonly routeId: string;
  readonly eventType: RouteEventType;
  readonly version: 1;
  readonly occurredAt: Date;
  readonly producer: 'routes';
  readonly fromState: RouteState;
  readonly toState: RouteState;
  readonly vehicleId: string;
  readonly courierId: string;
  readonly depotId?: string | null;
  readonly packageCount?: number;
  readonly metadata?: RouteEventMetadata;
}

export interface RoutePreparedEvent extends RouteDomainEventBase {
  readonly eventType: typeof RouteEventType.PREPARED;
  readonly fromState: typeof RouteState.PLANNED;
  readonly toState: typeof RouteState.READY;
}

export interface RouteStartedEvent extends RouteDomainEventBase {
  readonly eventType: typeof RouteEventType.STARTED;
  readonly fromState: typeof RouteState.READY;
  readonly toState: typeof RouteState.IN_PROGRESS;
  readonly startedAt: Date;
}

export interface RouteCancelledEvent extends RouteDomainEventBase {
  readonly eventType: typeof RouteEventType.CANCELLED;
  readonly fromState: typeof RouteState.PLANNED | typeof RouteState.READY;
  readonly toState: typeof RouteState.CANCELLED;
  readonly reasonCode: string;
  readonly reason?: string;
}

export interface RouteInterruptedEvent extends RouteDomainEventBase {
  readonly eventType: typeof RouteEventType.INTERRUPTED;
  readonly fromState: typeof RouteState.IN_PROGRESS;
  readonly toState: typeof RouteState.INTERRUPTED;
  readonly reasonCode: string;
  readonly reason?: string;
}

export interface RouteCompletedEvent extends RouteDomainEventBase {
  readonly eventType: typeof RouteEventType.COMPLETED;
  readonly fromState: typeof RouteState.IN_PROGRESS | typeof RouteState.INTERRUPTED;
  readonly toState: typeof RouteState.COMPLETED;
  readonly closureId: string;
  readonly mode: 'REGULAR' | 'FORCED';
  readonly completedAt: Date;
  readonly summaryVersion: 1;
  readonly totalAssigned: number;
  readonly deliveredCount: number;
  readonly failedCount: number;
  readonly rescheduledCount: number;
  readonly returnedCount: number;
  readonly pendingCount: number;
}

export type RouteDomainEvent =
  | RoutePreparedEvent
  | RouteStartedEvent
  | RouteCancelledEvent
  | RouteInterruptedEvent
  | RouteCompletedEvent;
