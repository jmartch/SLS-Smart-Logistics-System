import type { PackageAggregate } from '../../../packages/domain/package.aggregate';
import type { Route } from '../../../routes/domain/route';
import type { RouteStop } from '../../../routes/domain/route-stop';
import type { StoredEvidenceDescriptor } from './evidence-storage.port';

export interface DeliveryOperationRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly requestId: string;
  readonly actorUserId: string;
  readonly commandType: string;
  readonly targetId: string;
  readonly requestHash: string;
  readonly resultSnapshot: Record<string, unknown>;
  readonly createdAt: Date;
}

export interface DeliveryAttemptRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly routeStopId: string;
  readonly packageId: string;
  readonly courierId: string;
  readonly assignmentId: string;
  readonly attemptNumber: number;
  readonly outcome: 'DELIVERED' | 'FAILED' | 'RESCHEDULED';
  readonly reasonCode?: string | null;
  readonly notes?: string | null;
  readonly attemptedAt: Date;
}

export interface DeliveryWindowRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly packageId: string;
  readonly startAt: Date;
  readonly endAt: Date;
}

export interface IncidentRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly routeId?: string | null;
  readonly routeStopId?: string | null;
  readonly packageId?: string | null;
  readonly reportedByUserId: string;
  readonly type: string;
  readonly description: string;
  readonly status: 'OPEN' | 'RESOLVED' | 'CLOSED';
  readonly reportedAt: Date;
}

export interface OutboxMessage {
  readonly eventId: string;
  readonly tenantId: string;
  readonly correlationId: string;
  readonly eventType: string;
  readonly occurredAt: Date;
  readonly producer: string;
  readonly version: number;
  readonly payload: Record<string, unknown>;
}

export interface AuditEntry {
  readonly tenantId: string;
  readonly actorUserId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly action: string;
  readonly details?: Record<string, unknown>;
}

export interface DeliverySession {
  readonly tenantId: string;

  findOperation(requestId: string): Promise<DeliveryOperationRecord | null>;
  saveOperation(operation: DeliveryOperationRecord): Promise<void>;

  lockRoute(routeId: string): Promise<Route | null>;
  lockStop(stopId: string): Promise<RouteStop | null>;
  lockStopPackages(stopId: string): Promise<readonly PackageAggregate[]>;
  lockPackage(packageId: string): Promise<PackageAggregate | null>;

  getActiveAssignmentId(
    packageId: string,
    routeId: string,
  ): Promise<string | null>;
  getNextAttemptNumber(packageId: string): Promise<number>;
  getLastFailedAttempt(
    packageId: string,
  ): Promise<DeliveryAttemptRecord | null>;
  getStopActivePackageIds(stopId: string): Promise<readonly string[]>;

  savePackage(pkg: PackageAggregate): Promise<void>;
  updateStopActualTimes(
    stopId: string,
    actualArrivalAt?: Date,
    actualServiceEndAt?: Date,
    state?: 'COMPLETED' | 'FAILED',
  ): Promise<void>;
  endAssignment(assignmentId: string, reason: string): Promise<void>;

  saveAttempt(attempt: DeliveryAttemptRecord): Promise<void>;
  saveEvidences(
    attemptId: string,
    descriptors: readonly StoredEvidenceDescriptor[],
  ): Promise<readonly string[]>;
  saveDeliveryWindow(window: DeliveryWindowRecord): Promise<void>;
  saveIncident(incident: IncidentRecord): Promise<void>;

  recordAudit(entry: AuditEntry): Promise<void>;
  recordOutbox(message: OutboxMessage): Promise<void>;
}

export interface DeliveryUnitOfWork {
  run<T>(
    tenantId: string,
    work: (session: DeliverySession) => Promise<T>,
  ): Promise<T>;
}
