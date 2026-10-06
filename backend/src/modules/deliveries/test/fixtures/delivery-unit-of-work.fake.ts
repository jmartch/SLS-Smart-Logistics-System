/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unused-vars */
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import type { PackageAggregate } from '../../../packages/domain/package.aggregate';
import type { Route } from '../../../routes/domain/route';
import type { RouteStop } from '../../../routes/domain/route-stop';
import type {
  AuditEntry,
  DeliveryAttemptRecord,
  DeliveryOperationRecord,
  DeliverySession,
  DeliveryUnitOfWork,
  DeliveryWindowRecord,
  IncidentRecord,
  OutboxMessage,
} from '../../application/ports/delivery-unit-of-work';
import type { DeliveryAccessPort } from '../../application/ports/delivery-access.port';
import type {
  EvidenceStoragePort,
  EvidenceType,
  ReadEvidenceResult,
  StoredEvidenceDescriptor,
} from '../../application/ports/evidence-storage.port';

export class FakeDeliverySession implements DeliverySession {
  readonly operations = new Map<string, DeliveryOperationRecord>();
  readonly routes = new Map<string, Route>();
  readonly stops = new Map<string, RouteStop>();
  readonly packages = new Map<string, PackageAggregate>();
  readonly assignments = new Map<
    string,
    { packageId: string; routeId: string; status: 'ACTIVE' | 'ENDED' }
  >();
  readonly stopPackages = new Map<string, string[]>(); // stopId -> packageIds
  readonly attempts: DeliveryAttemptRecord[] = [];
  readonly evidences = new Map<string, StoredEvidenceDescriptor[]>(); // attemptId -> descriptors
  readonly windows: DeliveryWindowRecord[] = [];
  readonly incidents: IncidentRecord[] = [];
  readonly audits: AuditEntry[] = [];
  readonly outbox: OutboxMessage[] = [];

  constructor(readonly tenantId: string) {}

  async findOperation(
    requestId: string,
  ): Promise<DeliveryOperationRecord | null> {
    return this.operations.get(requestId) ?? null;
  }

  async saveOperation(operation: DeliveryOperationRecord): Promise<void> {
    this.operations.set(operation.requestId, operation);
  }

  async lockRoute(routeId: string): Promise<Route | null> {
    return this.routes.get(routeId) ?? null;
  }

  async lockStop(stopId: string): Promise<RouteStop | null> {
    return this.stops.get(stopId) ?? null;
  }

  async lockStopPackages(stopId: string): Promise<readonly PackageAggregate[]> {
    const pkgIds = this.stopPackages.get(stopId) ?? [];
    return pkgIds
      .map((id) => this.packages.get(id))
      .filter((pkg): pkg is PackageAggregate => pkg !== undefined);
  }

  async lockPackage(packageId: string): Promise<PackageAggregate | null> {
    return this.packages.get(packageId) ?? null;
  }

  async getActiveAssignmentId(
    packageId: string,
    routeId: string,
  ): Promise<string | null> {
    for (const [assignId, assign] of this.assignments.entries()) {
      if (
        assign.packageId === packageId &&
        assign.routeId === routeId &&
        assign.status === 'ACTIVE'
      ) {
        return assignId;
      }
    }
    return null;
  }

  async getNextAttemptNumber(packageId: string): Promise<number> {
    const packageAttempts = this.attempts.filter(
      (a) => a.packageId === packageId,
    );
    return packageAttempts.length + 1;
  }

  async getLastFailedAttempt(
    packageId: string,
  ): Promise<DeliveryAttemptRecord | null> {
    const failed = this.attempts
      .filter((a) => a.packageId === packageId && a.outcome === 'FAILED')
      .sort((a, b) => b.attemptNumber - a.attemptNumber);
    return failed[0] ?? null;
  }

  async getStopActivePackageIds(stopId: string): Promise<readonly string[]> {
    return this.stopPackages.get(stopId) ?? [];
  }

  async savePackage(pkg: PackageAggregate): Promise<void> {
    this.packages.set(pkg.id, pkg);
  }

  async updateStopActualTimes(
    _stopId: string,
    _actualArrivalAt?: Date,
    _actualServiceEndAt?: Date,
    _state?: 'COMPLETED' | 'FAILED',
  ): Promise<void> {
    // Registrado en memoria para pruebas
  }

  async endAssignment(assignmentId: string, _reason: string): Promise<void> {
    const assign = this.assignments.get(assignmentId);
    if (assign) {
      assign.status = 'ENDED';
    }
  }

  async saveAttempt(attempt: DeliveryAttemptRecord): Promise<void> {
    this.attempts.push(attempt);
  }

  async saveEvidences(
    attemptId: string,
    descriptors: readonly StoredEvidenceDescriptor[],
  ): Promise<readonly string[]> {
    this.evidences.set(attemptId, [...descriptors]);
    return descriptors.map((_, idx) => `evidence-id-${idx + 1}`);
  }

  async saveDeliveryWindow(window: DeliveryWindowRecord): Promise<void> {
    this.windows.push(window);
  }

  async saveIncident(incident: IncidentRecord): Promise<void> {
    this.incidents.push(incident);
  }

  async recordAudit(entry: AuditEntry): Promise<void> {
    this.audits.push(entry);
  }

  async recordOutbox(message: OutboxMessage): Promise<void> {
    this.outbox.push(message);
  }
}

export class FakeDeliveryUnitOfWork implements DeliveryUnitOfWork {
  public session = new FakeDeliverySession('tenant-1');
  public shouldFailCommit = false;

  async run<T>(
    tenantId: string,
    work: (session: DeliverySession) => Promise<T>,
  ): Promise<T> {
    if (this.session.tenantId !== tenantId) {
      this.session = new FakeDeliverySession(tenantId);
    }
    const result = await work(this.session);
    if (this.shouldFailCommit) {
      throw new Error('Simulated transaction commit failure');
    }
    return result;
  }
}

export class FakeDeliveryAccessPort implements DeliveryAccessPort {
  public courierIdToReturn: string | null = 'courier-1';
  public allowAttend = true;
  public allowRecordAttempt = true;
  public allowReschedule = true;
  public allowRequestReturn = true;
  public allowReceive = true;
  public allowReportIncident = true;
  public allowViewDeliveries = true;

  async getCourierIdForUser(): Promise<string | null> {
    return this.courierIdToReturn;
  }
  async canAttendStop(): Promise<boolean> {
    return this.allowAttend;
  }
  async canRecordAttempt(): Promise<boolean> {
    return this.allowRecordAttempt;
  }
  async canReschedule(): Promise<boolean> {
    return this.allowReschedule;
  }
  async canRequestReturn(): Promise<boolean> {
    return this.allowRequestReturn;
  }
  async canReceiveAtDepot(): Promise<boolean> {
    return this.allowReceive;
  }
  async canReportIncident(): Promise<boolean> {
    return this.allowReportIncident;
  }
  async canViewDeliveries(): Promise<boolean> {
    return this.allowViewDeliveries;
  }
}

export class FakeEvidenceStoragePort implements EvidenceStoragePort {
  readonly storedFiles = new Map<
    string,
    { buffer: Buffer; mimeType: string }
  >();

  async storeEvidence(
    tenantId: string,
    fileBuffer: Buffer,
    evidenceType: EvidenceType,
    mimeType: string,
  ): Promise<StoredEvidenceDescriptor> {
    const checksum = createHash('sha256').update(fileBuffer).digest('hex');
    const storageKey = `${tenantId}/evidence-${Date.now()}.${mimeType === 'image/png' ? 'png' : 'jpg'}`;
    this.storedFiles.set(storageKey, { buffer: fileBuffer, mimeType });
    return {
      storageKey,
      evidenceType,
      checksum,
      byteSize: fileBuffer.length,
      mimeType,
    };
  }

  async readEvidence(
    _tenantId: string,
    storageKey: string,
  ): Promise<ReadEvidenceResult> {
    const file = this.storedFiles.get(storageKey);
    if (!file) throw new Error(`File '${storageKey}' not found`);
    return {
      stream: Readable.from(file.buffer),
      mimeType: file.mimeType,
      byteSize: file.buffer.length,
    };
  }

  async deleteEvidence(_tenantId: string, storageKey: string): Promise<void> {
    this.storedFiles.delete(storageKey);
  }
}
