import { randomUUID } from 'node:crypto';
import { RouteState } from '../../../routes/domain/route-state';
import { DeliveryAttempt } from '../../domain/delivery-attempt';
import { DeliveryEvidence } from '../../domain/delivery-evidence';
import {
  DeliveryForbiddenError,
  DeliveryNotFoundError,
  DeliveryStateConflictError,
  DeliveryValidationError,
  IdempotencyConflictError,
} from '../../domain/delivery-errors';
import {
  DeliveryStopResolutionPolicy,
  type StopTerminalOutcome,
} from '../../domain/delivery-stop-resolution.policy';
import type { DeliveryAccessPort } from '../ports/delivery-access.port';
import type { DeliveryUnitOfWork } from '../ports/delivery-unit-of-work';
import type {
  EvidenceStoragePort,
  StoredEvidenceDescriptor,
} from '../ports/evidence-storage.port';

export interface FilePayload {
  readonly buffer: Buffer;
  readonly type: 'PHOTO' | 'SIGNATURE';
  readonly mimeType: string;
}

export interface RecordSuccessfulDeliveryCommand {
  readonly tenantId: string;
  readonly actorUserId: string;
  readonly routeId: string;
  readonly stopId: string;
  readonly packageId: string;
  readonly files: readonly FilePayload[];
  readonly notes?: string;
  readonly requestId: string;
  readonly correlationId?: string;
}

export interface RecordSuccessfulDeliveryResult {
  readonly attemptId: string;
  readonly attemptNumber: number;
  readonly outcome: 'DELIVERED';
  readonly packageId: string;
  readonly stopResolution: 'PENDING' | 'COMPLETED' | 'FAILED';
  readonly evidenceIds: readonly string[];
  readonly replayed: boolean;
}

export class RecordSuccessfulDeliveryUseCase {
  constructor(
    private readonly unitOfWork: DeliveryUnitOfWork,
    private readonly accessPort: DeliveryAccessPort,
    private readonly storagePort: EvidenceStoragePort,
  ) {}

  async execute(
    command: RecordSuccessfulDeliveryCommand,
  ): Promise<RecordSuccessfulDeliveryResult> {
    const {
      tenantId,
      actorUserId,
      routeId,
      stopId,
      packageId,
      requestId,
      files,
      notes,
    } = command;
    const correlationId = command.correlationId ?? randomUUID();

    if (!files || files.length === 0) {
      throw new DeliveryValidationError(
        'At least one evidence file (PHOTO or SIGNATURE) is required for successful delivery',
        'files',
      );
    }

    // 1. Guardar evidencias en storage desacoplado antes de la transacción (D5)
    const storedDescriptors: StoredEvidenceDescriptor[] = [];
    try {
      for (const file of files) {
        const descriptor = await this.storagePort.storeEvidence(
          tenantId,
          file.buffer,
          file.type,
          file.mimeType,
        );
        storedDescriptors.push(descriptor);
      }
    } catch (storageError) {
      // Limpiar cualquier archivo almacenado parcialmente
      for (const desc of storedDescriptors) {
        await this.storagePort
          .deleteEvidence(tenantId, desc.storageKey)
          .catch(() => {});
      }
      throw storageError;
    }

    try {
      return await this.unitOfWork.run(tenantId, async (session) => {
        // 2. Verificar idempotencia
        const existingOp = await session.findOperation(requestId);
        if (existingOp) {
          if (
            existingOp.commandType !== 'RECORD_DELIVERY_SUCCESS' ||
            existingOp.targetId !== packageId
          ) {
            throw new IdempotencyConflictError(requestId);
          }
          return {
            ...(existingOp.resultSnapshot as unknown as RecordSuccessfulDeliveryResult),
            replayed: true,
          };
        }

        // 3. Bloquear y validar ruta
        const route = await session.lockRoute(routeId);
        if (!route || route.tenantId !== tenantId) {
          throw new DeliveryNotFoundError(routeId, 'Route');
        }
        if (route.state !== RouteState.IN_PROGRESS) {
          throw new DeliveryStateConflictError(
            `Route '${routeId}' is not IN_PROGRESS`,
          );
        }

        const canDeliver = await this.accessPort.canRecordAttempt(
          tenantId,
          actorUserId,
          route.courierId,
        );
        if (!canDeliver) {
          throw new DeliveryForbiddenError(
            'Only the assigned courier can record delivery attempts',
          );
        }

        // 4. Bloquear y validar paquete
        const pkg = await session.lockPackage(packageId);
        if (!pkg || pkg.tenantId !== tenantId) {
          throw new DeliveryNotFoundError(packageId, 'Package');
        }
        if (pkg.state !== 'OUT_FOR_DELIVERY') {
          throw new DeliveryStateConflictError(
            `Package '${packageId}' must be in OUT_FOR_DELIVERY state to record delivery, currently in '${pkg.state}'`,
          );
        }

        // 5. Validar asignación activa
        const assignmentId = await session.getActiveAssignmentId(
          packageId,
          routeId,
        );
        if (!assignmentId) {
          throw new DeliveryStateConflictError(
            `No active assignment found for package '${packageId}' on route '${routeId}'`,
          );
        }

        // 6. Construir entidades de dominio con validación de invariantes
        const attemptId = randomUUID();
        const attemptNumber = await session.getNextAttemptNumber(packageId);
        const attemptedAt = new Date();

        const domainEvidences = storedDescriptors.map(
          (desc) =>
            new DeliveryEvidence({
              id: randomUUID(),
              tenantId,
              deliveryAttemptId: attemptId,
              evidenceType: desc.evidenceType,
              storageKey: desc.storageKey,
              checksum: desc.checksum,
              createdAt: attemptedAt,
            }),
        );

        const attempt = DeliveryAttempt.createSuccessful({
          id: attemptId,
          tenantId,
          routeStopId: stopId,
          packageId,
          courierId: route.courierId,
          assignmentId,
          attemptNumber,
          notes: notes ?? null,
          evidences: domainEvidences,
          attemptedAt,
        });

        // 7. Persistir intento, evidencias, cambio de estado y fin de asignación
        await session.saveAttempt({
          id: attempt.id,
          tenantId,
          routeStopId: attempt.routeStopId,
          packageId: attempt.packageId,
          courierId: attempt.courierId,
          assignmentId: attempt.assignmentId,
          attemptNumber: attempt.attemptNumber,
          outcome: 'DELIVERED',
          notes: attempt.notes,
          attemptedAt: attempt.attemptedAt,
        });

        const evidenceIds = await session.saveEvidences(
          attempt.id,
          storedDescriptors,
        );

        pkg.deliver({
          actorUserId,
          correlationId,
          occurredAt: attemptedAt,
        });
        await session.savePackage(pkg);
        await session.endAssignment(assignmentId, 'DELIVERED');

        // 8. Evaluar resolución de la parada multipaquete
        const manifestPackageIds =
          await session.getStopActivePackageIds(stopId);
        const outcomesMap = new Map<string, StopTerminalOutcome>();
        for (const pId of manifestPackageIds) {
          if (pId === packageId) {
            outcomesMap.set(pId, 'DELIVERED');
          } else {
            const otherPkg = await session.lockPackage(pId);
            if (otherPkg?.state === 'DELIVERED')
              outcomesMap.set(pId, 'DELIVERED');
            else if (otherPkg?.state === 'DELIVERY_FAILED')
              outcomesMap.set(pId, 'FAILED');
          }
        }

        const stopResolution = DeliveryStopResolutionPolicy.resolve({
          manifestPackageIds,
          terminalOutcomes: outcomesMap,
        });

        if (stopResolution !== 'PENDING') {
          await session.updateStopActualTimes(
            stopId,
            undefined,
            attemptedAt,
            stopResolution,
          );
        }

        // 9. Eventos Outbox, auditoría e idempotencia
        await session.recordOutbox({
          eventId: randomUUID(),
          tenantId,
          correlationId,
          eventType: 'PackageDelivered',
          occurredAt: attemptedAt,
          producer: 'sls-backend.deliveries',
          version: 1,
          payload: { packageId, routeId, stopId, attemptId: attempt.id },
        });

        await session.recordOutbox({
          eventId: randomUUID(),
          tenantId,
          correlationId,
          eventType: 'DeliveryAttempted',
          occurredAt: attemptedAt,
          producer: 'sls-backend.deliveries',
          version: 1,
          payload: {
            packageId,
            routeId,
            stopId,
            attemptId: attempt.id,
            outcome: 'DELIVERED',
          },
        });

        const result: RecordSuccessfulDeliveryResult = {
          attemptId: attempt.id,
          attemptNumber: attempt.attemptNumber,
          outcome: 'DELIVERED',
          packageId,
          stopResolution,
          evidenceIds,
          replayed: false,
        };

        await session.saveOperation({
          id: randomUUID(),
          tenantId,
          requestId,
          actorUserId,
          commandType: 'RECORD_DELIVERY_SUCCESS',
          targetId: packageId,
          requestHash: requestId,
          resultSnapshot: result as unknown as Record<string, unknown>,
          createdAt: attemptedAt,
        });

        return result;
      });
    } catch (txError) {
      // Rollback: limpiar los archivos subidos al disco si la transacción falló
      for (const desc of storedDescriptors) {
        await this.storagePort
          .deleteEvidence(tenantId, desc.storageKey)
          .catch(() => {});
      }
      throw txError;
    }
  }
}
