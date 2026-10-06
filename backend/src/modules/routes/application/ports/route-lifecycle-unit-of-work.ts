import { RouteRepository } from '../../domain/route.repository';

export interface RoutePackageSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly trackingCode: string;
  readonly currentState: string;
  readonly weightKg: number;
  readonly volumeM3: number;
}

export interface PackageStateUpdateItem {
  readonly packageId: string;
  readonly previousState: string;
  readonly nextState: string;
}

export interface PackageStatusHistoryItem {
  readonly packageId: string;
  readonly previousState: string;
  readonly nextState: string;
  readonly reasonCode?: string;
  readonly changedByUserId: string;
  readonly changedAt: Date;
}

export interface RouteAssignmentSnapshot {
  readonly id: string;
  readonly packageId: string;
  readonly routeId: string;
  readonly routeStopId?: string | null;
  readonly status: 'ACTIVE' | 'ENDED' | 'CANCELLED';
}

export interface RouteAuditLogEntry {
  readonly tenantId: string;
  readonly actorUserId: string;
  readonly action: string;
  readonly entityType: 'ROUTE';
  readonly entityId: string;
  readonly previousState?: string;
  readonly newState: string;
  readonly correlationId: string;
  readonly timestamp: Date;
  readonly details?: Record<string, unknown>;
}

export interface RouteOutboxEventEntry {
  readonly eventId: string;
  readonly tenantId: string;
  readonly correlationId: string;
  readonly eventType: string;
  readonly occurredAt: Date;
  readonly producer: string;
  readonly version: number;
  readonly payload: Record<string, unknown>;
}

export interface RoutePackageWriterPort {
  findPackagesByRouteId(
    tenantId: string,
    routeId: string,
  ): Promise<readonly RoutePackageSnapshot[]>;
  updatePackageStates(
    tenantId: string,
    updates: readonly PackageStateUpdateItem[],
  ): Promise<void>;
  recordStatusHistories(
    tenantId: string,
    histories: readonly PackageStatusHistoryItem[],
  ): Promise<void>;
}

export interface RouteAssignmentWriterPort {
  findActiveAssignmentsByRouteId(
    tenantId: string,
    routeId: string,
  ): Promise<readonly RouteAssignmentSnapshot[]>;
  cancelAssignmentsByRouteId(
    tenantId: string,
    routeId: string,
    reasonCode: string,
    endedAt: Date,
  ): Promise<number>;
}

export interface RouteAuditPort {
  recordAuditLog(entry: RouteAuditLogEntry): Promise<void>;
}

export interface RouteOutboxPort {
  recordEvents(events: readonly RouteOutboxEventEntry[]): Promise<void>;
}

export interface RouteLifecycleSession {
  readonly routes: RouteRepository;
  readonly packages: RoutePackageWriterPort;
  readonly assignments: RouteAssignmentWriterPort;
  readonly audit: RouteAuditPort;
  readonly outbox: RouteOutboxPort;
}

export interface RouteLifecycleUnitOfWork {
  executeInTransaction<T>(
    tenantId: string,
    operation: (session: RouteLifecycleSession) => Promise<T>,
  ): Promise<T>;
}
