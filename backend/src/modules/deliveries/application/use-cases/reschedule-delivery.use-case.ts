import { randomUUID } from 'node:crypto';
import {
  DeliveryForbiddenError,
  DeliveryNotFoundError,
  DeliveryStateConflictError,
  DeliveryValidationError,
  IdempotencyConflictError,
} from '../../domain/delivery-errors';
import type { DeliveryAccessPort } from '../ports/delivery-access.port';
import type { DeliveryUnitOfWork } from '../ports/delivery-unit-of-work';

export interface RescheduleDeliveryCommand {
  readonly tenantId: string;
  readonly actorUserId: string;
  readonly packageId: string;
  readonly failedAttemptId: string;
  readonly startAt: Date;
  readonly endAt: Date;
  readonly reasonCode: string;
  readonly requestId: string;
  readonly correlationId?: string;
}

export interface RescheduleDeliveryResult {
  readonly packageId: string;
  readonly windowId: string;
  readonly newStatus: 'RESCHEDULED';
  readonly startAt: Date;
  readonly endAt: Date;
  readonly replayed: boolean;
}

export class RescheduleDeliveryUseCase {
  constructor(
    private readonly unitOfWork: DeliveryUnitOfWork,
    private readonly accessPort: DeliveryAccessPort,
  ) {}

  async execute(
    command: RescheduleDeliveryCommand,
  ): Promise<RescheduleDeliveryResult> {
    const {
      tenantId,
      actorUserId,
      packageId,
      failedAttemptId,
      startAt,
      endAt,
      reasonCode,
      requestId,
    } = command;
    const correlationId = command.correlationId ?? randomUUID();

    // 1. Validar ventana horaria acordada
    if (
      !(startAt instanceof Date) ||
      !(endAt instanceof Date) ||
      isNaN(startAt.getTime()) ||
      isNaN(endAt.getTime())
    ) {
      throw new DeliveryValidationError(
        'startAt and endAt must be valid dates',
        'startAt',
      );
    }

    if (startAt >= endAt) {
      throw new DeliveryValidationError(
        'startAt must be earlier than endAt',
        'startAt',
      );
    }

    // 2. Validar permisos de coordinación
    const canReschedule = await this.accessPort.canReschedule(
      tenantId,
      actorUserId,
    );
    if (!canReschedule) {
      throw new DeliveryForbiddenError(
        'Only coordinators can reschedule failed packages',
      );
    }

    return this.unitOfWork.run(tenantId, async (session) => {
      // 3. Idempotencia
      const existingOp = await session.findOperation(requestId);
      if (existingOp) {
        if (
          existingOp.commandType !== 'RESCHEDULE_PACKAGE' ||
          existingOp.targetId !== packageId
        ) {
          throw new IdempotencyConflictError(requestId);
        }
        return {
          ...(existingOp.resultSnapshot as unknown as RescheduleDeliveryResult),
          replayed: true,
        };
      }

      // 4. Bloquear y validar paquete
      const pkg = await session.lockPackage(packageId);
      if (!pkg || pkg.tenantId !== tenantId) {
        throw new DeliveryNotFoundError(packageId, 'Package');
      }

      if (pkg.state !== 'DELIVERY_FAILED') {
        throw new DeliveryStateConflictError(
          `Package '${packageId}' must be in DELIVERY_FAILED state to be rescheduled, currently in '${pkg.state}'`,
        );
      }

      // 5. Validar que el intento fallido exista y sea el último
      const lastFailed = await session.getLastFailedAttempt(packageId);
      if (!lastFailed || lastFailed.id !== failedAttemptId) {
        throw new DeliveryValidationError(
          `failedAttemptId '${failedAttemptId}' does not match the latest failed delivery attempt`,
          'failedAttemptId',
        );
      }

      // 6. Transicionar aggregate y guardar nueva ventana horaria
      const windowId = randomUUID();
      const now = new Date();

      await session.saveDeliveryWindow({
        id: windowId,
        tenantId,
        packageId,
        startAt,
        endAt,
      });

      pkg.reschedule(reasonCode, {
        actorUserId,
        correlationId,
        occurredAt: now,
      });
      await session.savePackage(pkg);

      // 7. Outbox, auditoría y recibo
      // Nota: La custodia física en vehículo permanece activa (ACTIVE) hasta la recepción física en depósito.
      await session.recordOutbox({
        eventId: randomUUID(),
        tenantId,
        correlationId,
        eventType: 'PackageRescheduled',
        occurredAt: now,
        producer: 'sls-backend.deliveries',
        version: 1,
        payload: { packageId, windowId, reasonCode },
      });

      const result: RescheduleDeliveryResult = {
        packageId,
        windowId,
        newStatus: 'RESCHEDULED',
        startAt,
        endAt,
        replayed: false,
      };

      await session.saveOperation({
        id: randomUUID(),
        tenantId,
        requestId,
        actorUserId,
        commandType: 'RESCHEDULE_PACKAGE',
        targetId: packageId,
        requestHash: requestId,
        resultSnapshot: result as unknown as Record<string, unknown>,
        createdAt: now,
      });

      return result;
    });
  }
}
