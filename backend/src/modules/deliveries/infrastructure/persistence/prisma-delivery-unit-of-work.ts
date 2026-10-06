import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../../generated/prisma/client';
import { PrismaService } from '../../../../database/prisma.service';
import { runWithTenant } from '../../../../database/run-with-tenant';
import { PackageAggregate } from '../../../packages/domain/package.aggregate';
import type { PackageStateName } from '../../../packages/domain/package-state.types';
import { Route } from '../../../routes/domain/route';
import { RouteStop } from '../../../routes/domain/route-stop';
import { RoutePersistenceMapper } from '../../../routes/infrastructure/persistence/route-persistence.mapper';
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
import type { StoredEvidenceDescriptor } from '../../application/ports/evidence-storage.port';

export class PrismaDeliverySession implements DeliverySession {
  constructor(
    readonly tenantId: string,
    private readonly tx: Prisma.TransactionClient,
  ) {}

  async findOperation(
    requestId: string,
  ): Promise<DeliveryOperationRecord | null> {
    const raw = await this.tx.deliveryOperation.findUnique({
      where: {
        tenantId_requestId: {
          tenantId: this.tenantId,
          requestId,
        },
      },
    });

    if (!raw) return null;

    return {
      id: raw.id,
      tenantId: raw.tenantId,
      requestId: raw.requestId,
      actorUserId: raw.actorUserId,
      commandType: raw.commandType,
      targetId: raw.targetId,
      requestHash: raw.requestHash,
      resultSnapshot: raw.resultSnapshot as Record<string, unknown>,
      createdAt: raw.createdAt,
    };
  }

  async saveOperation(operation: DeliveryOperationRecord): Promise<void> {
    await this.tx.deliveryOperation.create({
      data: {
        id: operation.id,
        tenantId: this.tenantId,
        requestId: operation.requestId,
        actorUserId: operation.actorUserId,
        commandType: operation.commandType,
        targetId: operation.targetId,
        requestHash: operation.requestHash,
        resultSnapshot: operation.resultSnapshot as Prisma.InputJsonValue,
        createdAt: operation.createdAt,
      },
    });
  }

  async lockRoute(routeId: string): Promise<Route | null> {
    // Bloqueo determinista anti-deadlock de Route con FOR UPDATE
    const lockedRows = await this.tx.$queryRaw<{ id: string }[]>`
            SELECT id FROM "Route"
            WHERE "tenantId" = ${this.tenantId}::uuid AND id = ${routeId}::uuid
            FOR UPDATE
        `;
    if (lockedRows.length === 0) return null;

    const raw = await this.tx.route.findUnique({
      where: {
        tenantId_id: {
          tenantId: this.tenantId,
          id: routeId,
        },
      },
      include: {
        stops: {
          orderBy: { sequence: 'asc' },
        },
      },
    });

    return raw ? RoutePersistenceMapper.toDomain(raw) : null;
  }

  async lockStop(stopId: string): Promise<RouteStop | null> {
    const lockedRows = await this.tx.$queryRaw<{ id: string }[]>`
            SELECT id FROM "RouteStop"
            WHERE "tenantId" = ${this.tenantId}::uuid AND id = ${stopId}::uuid
            FOR UPDATE
        `;
    if (lockedRows.length === 0) return null;

    const raw = await this.tx.routeStop.findUnique({
      where: {
        tenantId_id: {
          tenantId: this.tenantId,
          id: stopId,
        },
      },
    });

    if (!raw) return null;

    return new RouteStop({
      id: raw.id,
      tenantId: raw.tenantId,
      routeId: raw.routeId,
      stopNumber: raw.sequence,
      latitude: Number(raw.latitude),
      longitude: Number(raw.longitude),
      state: raw.state,
    });
  }

  async lockStopPackages(stopId: string): Promise<readonly PackageAggregate[]> {
    // Bloqueo determinista de paquetes de la parada en orden de ID ascendente
    const rows = await this.tx.$queryRaw<
      { id: string; tenantId: string; state: PackageStateName }[]
    >`
            SELECT p.id, p."tenantId", p.state
            FROM "Package" p
            INNER JOIN "Assignment" a ON a."packageId" = p.id AND a."tenantId" = p."tenantId"
            WHERE p."tenantId" = ${this.tenantId}::uuid
                AND a."routeStopId" = ${stopId}::uuid
                AND a.status = 'ACTIVE'
            ORDER BY p.id ASC
            FOR UPDATE OF p
        `;

    return rows.map((r) =>
      PackageAggregate.reconstitute({
        id: r.id,
        tenantId: r.tenantId,
        state: r.state,
      }),
    );
  }

  async lockPackage(packageId: string): Promise<PackageAggregate | null> {
    const rows = await this.tx.$queryRaw<
      { id: string; tenantId: string; state: PackageStateName }[]
    >`
            SELECT id, "tenantId", state
            FROM "Package"
            WHERE "tenantId" = ${this.tenantId}::uuid AND id = ${packageId}::uuid
            FOR UPDATE
        `;
    if (rows.length === 0) return null;

    return PackageAggregate.reconstitute({
      id: rows[0].id,
      tenantId: rows[0].tenantId,
      state: rows[0].state,
    });
  }

  async getActiveAssignmentId(
    packageId: string,
    routeId: string,
  ): Promise<string | null> {
    const raw = await this.tx.assignment.findFirst({
      where: {
        tenantId: this.tenantId,
        packageId,
        routeId,
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    return raw?.id ?? null;
  }

  async getNextAttemptNumber(packageId: string): Promise<number> {
    const count = await this.tx.deliveryAttempt.count({
      where: {
        tenantId: this.tenantId,
        packageId,
      },
    });
    return count + 1;
  }

  async getLastFailedAttempt(
    packageId: string,
  ): Promise<DeliveryAttemptRecord | null> {
    const raw = await this.tx.deliveryAttempt.findFirst({
      where: {
        tenantId: this.tenantId,
        packageId,
        outcome: 'FAILED',
      },
      orderBy: { attemptNumber: 'desc' },
    });

    if (!raw) return null;

    return {
      id: raw.id,
      tenantId: raw.tenantId,
      routeStopId: raw.routeStopId,
      packageId: raw.packageId,
      courierId: raw.courierId,
      assignmentId: raw.assignmentId ?? '',
      attemptNumber: raw.attemptNumber,
      outcome: raw.outcome as 'FAILED',
      reasonCode: raw.failureReasonCode,
      notes: raw.notes,
      attemptedAt: raw.attemptedAt,
    };
  }

  async getStopActivePackageIds(stopId: string): Promise<readonly string[]> {
    const assignments = await this.tx.assignment.findMany({
      where: {
        tenantId: this.tenantId,
        routeStopId: stopId,
        status: { in: ['ACTIVE', 'ENDED'] },
      },
      select: { packageId: true },
      distinct: ['packageId'],
      orderBy: { packageId: 'asc' },
    });
    return assignments.map((a) => a.packageId);
  }

  async savePackage(pkg: PackageAggregate): Promise<void> {
    await this.tx.package.update({
      where: {
        tenantId_id: {
          tenantId: this.tenantId,
          id: pkg.id,
        },
      },
      data: {
        state: pkg.state,
      },
    });
  }

  async updateStopActualTimes(
    stopId: string,
    actualArrivalAt?: Date,
    actualServiceEndAt?: Date,
    state?: 'COMPLETED' | 'FAILED',
  ): Promise<void> {
    await this.tx.routeStop.update({
      where: {
        tenantId_id: {
          tenantId: this.tenantId,
          id: stopId,
        },
      },
      data: {
        ...(actualArrivalAt ? { arrivalAt: actualArrivalAt } : {}),
        ...(actualServiceEndAt ? { serviceEndAt: actualServiceEndAt } : {}),
        ...(state ? { state } : {}),
      },
    });
  }

  async endAssignment(assignmentId: string, reason: string): Promise<void> {
    await this.tx.assignment.update({
      where: {
        id: assignmentId,
      },
      data: {
        status: 'ENDED',
        endedAt: new Date(),
        reasonCode: reason,
      },
    });
  }

  async saveAttempt(attempt: DeliveryAttemptRecord): Promise<void> {
    await this.tx.deliveryAttempt.create({
      data: {
        id: attempt.id,
        tenantId: this.tenantId,
        routeStopId: attempt.routeStopId,
        packageId: attempt.packageId,
        courierId: attempt.courierId,
        assignmentId: attempt.assignmentId ? attempt.assignmentId : null,
        attemptNumber: attempt.attemptNumber,
        outcome: attempt.outcome,
        failureReasonCode: attempt.reasonCode ?? null,
        notes: attempt.notes ?? null,
        attemptedAt: attempt.attemptedAt,
      },
    });
  }

  async saveEvidences(
    attemptId: string,
    descriptors: readonly StoredEvidenceDescriptor[],
  ): Promise<readonly string[]> {
    const ids: string[] = [];
    for (const desc of descriptors) {
      const evidence = await this.tx.deliveryEvidence.create({
        data: {
          tenantId: this.tenantId,
          deliveryAttemptId: attemptId,
          evidenceType: desc.evidenceType,
          storageKey: desc.storageKey,
          checksum: desc.checksum,
          byteSize: desc.byteSize,
          mimeType: desc.mimeType,
        },
        select: { id: true },
      });
      ids.push(evidence.id);
    }
    return ids;
  }

  async saveDeliveryWindow(window: DeliveryWindowRecord): Promise<void> {
    await this.tx.deliveryWindow.create({
      data: {
        id: window.id,
        tenantId: this.tenantId,
        packageId: window.packageId,
        startAt: window.startAt,
        endAt: window.endAt,
      },
    });
  }

  async saveIncident(incident: IncidentRecord): Promise<void> {
    await this.tx.incident.create({
      data: {
        id: incident.id,
        tenantId: this.tenantId,
        routeId: incident.routeId ?? null,
        routeStopId: incident.routeStopId ?? null,
        packageId: incident.packageId ?? null,
        reportedByUserId: incident.reportedByUserId,
        type: incident.type,
        description: incident.description,
        status: incident.status,
        reportedAt: incident.reportedAt,
      },
    });
  }

  async recordAudit(entry: AuditEntry): Promise<void> {
    await this.tx.auditLog.create({
      data: {
        tenantId: this.tenantId,
        actorUserId: entry.actorUserId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        metadata: (entry.details ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  async recordOutbox(message: OutboxMessage): Promise<void> {
    await this.tx.outboxEvent.create({
      data: {
        tenantId: this.tenantId,
        eventId: message.eventId,
        correlationId: message.correlationId,
        eventType: message.eventType,
        version: message.version,
        payload: message.payload as Prisma.InputJsonValue,
        status: 'PENDING',
        occurredAt: message.occurredAt,
      },
    });
  }
}

@Injectable()
export class PrismaDeliveryUnitOfWork implements DeliveryUnitOfWork {
  private static readonly MAX_ATTEMPTS = 3;

  constructor(private readonly prisma: PrismaService) {}

  async run<T>(
    tenantId: string,
    work: (session: DeliverySession) => Promise<T>,
  ): Promise<T> {
    for (
      let attempt = 0;
      attempt < PrismaDeliveryUnitOfWork.MAX_ATTEMPTS;
      attempt++
    ) {
      try {
        return await runWithTenant(
          this.prisma,
          tenantId,
          async (tx) => {
            const session = new PrismaDeliverySession(tenantId, tx);
            return await work(session);
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          },
        );
      } catch (error: unknown) {
        const isLastAttempt =
          attempt === PrismaDeliveryUnitOfWork.MAX_ATTEMPTS - 1;
        if (isLastAttempt || !this.isRetryableTransactionError(error)) {
          throw error;
        }
        const delayMs = Math.floor(
          Math.pow(2, attempt) * 25 + Math.random() * 25,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw new Error('DELIVERY_TRANSACTION_RETRY_EXHAUSTED');
  }

  private isRetryableTransactionError(error: unknown): boolean {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2034') {
        return true;
      }
      const metaCode = (error.meta as { code?: string } | undefined)?.code;
      if (metaCode === '40001' || metaCode === '40P01') {
        return true;
      }
    }

    const err = error as {
      code?: string;
      message?: string;
      meta?: { code?: string };
    };
    const code = err?.code ?? err?.meta?.code;
    if (code === '40001' || code === '40P01') {
      return true;
    }

    const message = err?.message ?? '';
    return (
      message.includes('40001') ||
      message.includes('could not serialize access')
    );
  }
}
