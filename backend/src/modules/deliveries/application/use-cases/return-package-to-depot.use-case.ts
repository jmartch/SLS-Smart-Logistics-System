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

export interface ReturnPackageToDepotCommand {
  readonly tenantId: string;
  readonly actorUserId: string;
  readonly packageId: string;
  readonly routeId: string;
  readonly depotId: string;
  readonly physicalReceiptConfirmed: boolean;
  readonly requestId: string;
  readonly correlationId?: string;
}

export interface ReturnPackageToDepotResult {
  readonly packageId: string;
  readonly status: 'RETURNED' | 'RESCHEDULED';
  readonly assignmentEnded: boolean;
  readonly depotId: string;
  readonly replayed: boolean;
}

export class ReturnPackageToDepotUseCase {
  constructor(
    private readonly unitOfWork: DeliveryUnitOfWork,
    private readonly accessPort: DeliveryAccessPort,
  ) {}

  async execute(
    command: ReturnPackageToDepotCommand,
  ): Promise<ReturnPackageToDepotResult> {
    const {
      tenantId,
      actorUserId,
      packageId,
      routeId,
      depotId,
      physicalReceiptConfirmed,
      requestId,
    } = command;
    const correlationId = command.correlationId ?? randomUUID();

    if (!physicalReceiptConfirmed) {
      throw new DeliveryValidationError(
        'Physical receipt at depot must be explicitly confirmed',
        'physicalReceiptConfirmed',
      );
    }

    if (!depotId || !depotId.trim()) {
      throw new DeliveryValidationError(
        'depotId is mandatory for physical reception',
        'depotId',
      );
    }

    const canReceive = await this.accessPort.canReceiveAtDepot(
      tenantId,
      actorUserId,
    );
    if (!canReceive) {
      throw new DeliveryForbiddenError(
        'Actor is not authorized to receive packages at depot',
      );
    }

    return this.unitOfWork.run(tenantId, async (session) => {
      // 1. Idempotencia
      const existingOp = await session.findOperation(requestId);
      if (existingOp) {
        if (
          existingOp.commandType !== 'RECEIVE_AT_DEPOT' ||
          existingOp.targetId !== packageId
        ) {
          throw new IdempotencyConflictError(requestId);
        }
        return {
          ...(existingOp.resultSnapshot as unknown as ReturnPackageToDepotResult),
          replayed: true,
        };
      }

      // 2. Bloquear y validar paquete
      const pkg = await session.lockPackage(packageId);
      if (!pkg || pkg.tenantId !== tenantId) {
        throw new DeliveryNotFoundError(packageId, 'Package');
      }

      // 3. Diferenciar RETURN_PENDING de RESCHEDULED (D2)
      const now = new Date();
      let resultingStatus: 'RETURNED' | 'RESCHEDULED';

      if (pkg.state === 'RETURN_PENDING') {
        pkg.returnToDepot({
          actorUserId,
          correlationId,
          occurredAt: now,
        });
        resultingStatus = 'RETURNED';

        await session.recordOutbox({
          eventId: randomUUID(),
          tenantId,
          correlationId,
          eventType: 'PackageReturned',
          occurredAt: now,
          producer: 'sls-backend.deliveries',
          version: 1,
          payload: { packageId, depotId },
        });
      } else if (pkg.state === 'RESCHEDULED') {
        // Paquete reprogramado ingresa físicamente a depósito; conserva su estado para futuro despacho
        resultingStatus = 'RESCHEDULED';

        await session.recordOutbox({
          eventId: randomUUID(),
          tenantId,
          correlationId,
          eventType: 'PackageReceivedAtDepot',
          occurredAt: now,
          producer: 'sls-backend.deliveries',
          version: 1,
          payload: { packageId, depotId, reason: 'Awaiting new dispatch' },
        });
      } else {
        throw new DeliveryStateConflictError(
          `Package '${packageId}' must be in RETURN_PENDING or RESCHEDULED state to be received at depot, currently in '${pkg.state}'`,
        );
      }

      await session.savePackage(pkg);

      // 4. Liberar la custodia física finalizando la asignación activa previa
      const assignmentId = await session.getActiveAssignmentId(
        packageId,
        routeId,
      );
      if (assignmentId) {
        await session.endAssignment(
          assignmentId,
          `RECEIVED_AT_DEPOT_${resultingStatus}`,
        );
      }

      // 5. Auditoría y recibo
      const result: ReturnPackageToDepotResult = {
        packageId,
        status: resultingStatus,
        assignmentEnded: !!assignmentId,
        depotId,
        replayed: false,
      };

      await session.recordAudit({
        tenantId,
        actorUserId,
        entityType: 'Package',
        entityId: packageId,
        action: 'RECEIVE_AT_DEPOT',
        details: { status: resultingStatus, depotId, assignmentId },
      });

      await session.saveOperation({
        id: randomUUID(),
        tenantId,
        requestId,
        actorUserId,
        commandType: 'RECEIVE_AT_DEPOT',
        targetId: packageId,
        requestHash: requestId,
        resultSnapshot: result as unknown as Record<string, unknown>,
        createdAt: now,
      });

      return result;
    });
  }
}
