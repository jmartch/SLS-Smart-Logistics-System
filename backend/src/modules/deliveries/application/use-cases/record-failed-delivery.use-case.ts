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
  DeliveryFailureReason,
  isValidDeliveryFailureReason,
} from '../../domain/delivery-failure-reason';
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
import type { FilePayload } from './record-successful-delivery.use-case';

export interface RecordFailedDeliveryCommand {
  readonly tenantId: string;
  readonly actorUserId: string;
  readonly routeId: string;
  readonly stopId: string;
  readonly packageId: string;
  readonly reasonCode: string;
  readonly notes?: string;
  readonly files?: readonly FilePayload[];
  readonly requestId: string;
  readonly correlationId?: string;
}

export interface RecordFailedDeliveryResult {
  readonly attemptId: string;
  readonly attemptNumber: number;
  readonly outcome: 'FAILED';
  readonly packageId: string;
  readonly reasonCode: string;
  readonly stopResolution: 'PENDING' | 'COMPLETED' | 'FAILED';
  readonly replayed: boolean;
}

export class RecordFailedDeliveryUseCase {
  constructor(
    private readonly unitOfWork: DeliveryUnitOfWork,
    private readonly accessPort: DeliveryAccessPort,
    private readonly storagePort: EvidenceStoragePort,
  ) {}

  async execute(
    command: RecordFailedDeliveryCommand,
  ): Promise<RecordFailedDeliveryResult> {
    const {
      tenantId,
      actorUserId,
      routeId,
      stopId,
      packageId,
      requestId,
      reasonCode,
      notes,
      files,
    } = command;
    const correlationId = command.correlationId ?? randomUUID();

    if (!isValidDeliveryFailureReason(reasonCode)) {
      throw new DeliveryValidationError(
        `Invalid delivery failure reason: '${reasonCode}'`,
        'reasonCode',
      );
    }

    if (
      reasonCode === DeliveryFailureReason.OTHER &&
      (!notes || !notes.trim())
    ) {
      throw new DeliveryValidationError(
        'Delivery failure reason "OTHER" requires descriptive notes',
        'notes',
      );
    }

    // 1. Guardar archivos opcionales si fueron provistos
    const storedDescriptors: StoredEvidenceDescriptor[] = [];
    if (files && files.length > 0) {
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
        for (const desc of storedDescriptors) {
          await this.storagePort
            .deleteEvidence(tenantId, desc.storageKey)
            .catch(() => {});
        }
        throw storageError;
      }
    }

    try {
      return await this.unitOfWork.run(tenantId, async (session) => {
        // 2. Verificar idempotencia
        const existingOp = await session.findOperation(requestId);
        if (existingOp) {
          if (
            existingOp.commandType !== 'RECORD_DELIVERY_FAILURE' ||
            existingOp.targetId !== packageId
          ) {
            throw new IdempotencyConflictError(requestId);
          }
          return {
            ...(existingOp.resultSnapshot as unknown as RecordFailedDeliveryResult),
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

        const canFail = await this.accessPort.canRecordAttempt(
          tenantId,
          actorUserId,
          route.courierId,
        );
        if (!canFail) {
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
            `Package '${packageId}' must be in OUT_FOR_DELIVERY state to record failure, currently in '${pkg.state}'`,
          );
        }

        // 5. Validar asignación activa (permanece ACTIVE porque la carga física sigue en el vehículo)
        const assignmentId = await session.getActiveAssignmentId(
          packageId,
          routeId,
        );
        if (!assignmentId) {
          throw new DeliveryStateConflictError(
            `No active assignment found for package '${packageId}' on route '${routeId}'`,
          );
        }

        // 6. Construir entidades de dominio
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

        const attempt = DeliveryAttempt.createFailed({
          id: attemptId,
          tenantId,
          routeStopId: stopId,
          packageId,
          courierId: route.courierId,
          assignmentId,
          attemptNumber,
          reasonCode,
          notes: notes ? notes.trim() : null,
          evidences: domainEvidences,
          attemptedAt,
        });

        // 7. Persistir intento, evidencias opcionales y State DELIVERY_FAILED
        await session.saveAttempt({
          id: attempt.id,
          tenantId,
          routeStopId: attempt.routeStopId,
          packageId: attempt.packageId,
          courierId: attempt.courierId,
          assignmentId: attempt.assignmentId,
          attemptNumber: attempt.attemptNumber,
          outcome: 'FAILED',
          reasonCode: attempt.reasonCode,
          notes: attempt.notes,
          attemptedAt: attempt.attemptedAt,
        });

        if (storedDescriptors.length > 0) {
          await session.saveEvidences(attempt.id, storedDescriptors);
        }

        pkg.failDelivery(reasonCode, {
          actorUserId,
          correlationId,
          occurredAt: attemptedAt,
        });
        await session.savePackage(pkg);

        // 8. Evaluar resolución de parada (si faltan paquetes sigue PENDING; si todos fueron atendidos se vuelve FAILED)
        const manifestPackageIds =
          await session.getStopActivePackageIds(stopId);
        const outcomesMap = new Map<string, StopTerminalOutcome>();
        for (const pId of manifestPackageIds) {
          if (pId === packageId) {
            outcomesMap.set(pId, 'FAILED');
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
          eventType: 'DeliveryFailed',
          occurredAt: attemptedAt,
          producer: 'sls-backend.deliveries',
          version: 1,
          payload: {
            packageId,
            routeId,
            stopId,
            attemptId: attempt.id,
            reasonCode,
          },
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
            outcome: 'FAILED',
            reasonCode,
          },
        });

        const result: RecordFailedDeliveryResult = {
          attemptId: attempt.id,
          attemptNumber: attempt.attemptNumber,
          outcome: 'FAILED',
          packageId,
          reasonCode,
          stopResolution,
          replayed: false,
        };

        await session.saveOperation({
          id: randomUUID(),
          tenantId,
          requestId,
          actorUserId,
          commandType: 'RECORD_DELIVERY_FAILURE',
          targetId: packageId,
          requestHash: requestId,
          resultSnapshot: result as unknown as Record<string, unknown>,
          createdAt: attemptedAt,
        });

        return result;
      });
    } catch (txError) {
      for (const desc of storedDescriptors) {
        await this.storagePort
          .deleteEvidence(tenantId, desc.storageKey)
          .catch(() => {});
      }
      throw txError;
    }
  }
}
