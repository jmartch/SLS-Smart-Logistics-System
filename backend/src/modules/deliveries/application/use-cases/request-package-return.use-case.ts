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

export interface RequestPackageReturnCommand {
  readonly tenantId: string;
  readonly actorUserId: string;
  readonly packageId: string;
  readonly failedAttemptId: string;
  readonly reasonCode: string;
  readonly requestId: string;
  readonly correlationId?: string;
}

export interface RequestPackageReturnResult {
  readonly packageId: string;
  readonly newStatus: 'RETURN_PENDING';
  readonly reasonCode: string;
  readonly replayed: boolean;
}

export class RequestPackageReturnUseCase {
  constructor(
    private readonly unitOfWork: DeliveryUnitOfWork,
    private readonly accessPort: DeliveryAccessPort,
  ) {}

  async execute(
    command: RequestPackageReturnCommand,
  ): Promise<RequestPackageReturnResult> {
    const {
      tenantId,
      actorUserId,
      packageId,
      failedAttemptId,
      reasonCode,
      requestId,
    } = command;
    const correlationId = command.correlationId ?? randomUUID();

    if (!reasonCode || !reasonCode.trim()) {
      throw new DeliveryValidationError(
        'reasonCode is mandatory for return request',
        'reasonCode',
      );
    }

    const canRequestReturn = await this.accessPort.canRequestReturn(
      tenantId,
      actorUserId,
    );
    if (!canRequestReturn) {
      throw new DeliveryForbiddenError(
        'Only coordinators can request package returns',
      );
    }

    return this.unitOfWork.run(tenantId, async (session) => {
      // 1. Idempotencia
      const existingOp = await session.findOperation(requestId);
      if (existingOp) {
        if (
          existingOp.commandType !== 'REQUEST_PACKAGE_RETURN' ||
          existingOp.targetId !== packageId
        ) {
          throw new IdempotencyConflictError(requestId);
        }
        return {
          ...(existingOp.resultSnapshot as unknown as RequestPackageReturnResult),
          replayed: true,
        };
      }

      // 2. Bloquear y validar paquete
      const pkg = await session.lockPackage(packageId);
      if (!pkg || pkg.tenantId !== tenantId) {
        throw new DeliveryNotFoundError(packageId, 'Package');
      }

      if (pkg.state !== 'DELIVERY_FAILED') {
        throw new DeliveryStateConflictError(
          `Package '${packageId}' must be in DELIVERY_FAILED state to request return, currently in '${pkg.state}'`,
        );
      }

      // 3. Validar intento fallido
      const lastFailed = await session.getLastFailedAttempt(packageId);
      if (!lastFailed || lastFailed.id !== failedAttemptId) {
        throw new DeliveryValidationError(
          `failedAttemptId '${failedAttemptId}' does not match the latest failed delivery attempt`,
          'failedAttemptId',
        );
      }

      // 4. Transicionar a RETURN_PENDING
      const now = new Date();
      pkg.requestReturn(reasonCode, {
        actorUserId,
        correlationId,
        occurredAt: now,
      });
      await session.savePackage(pkg);

      // 5. Outbox, auditoría e idempotencia
      await session.recordOutbox({
        eventId: randomUUID(),
        tenantId,
        correlationId,
        eventType: 'PackageReturnPending',
        occurredAt: now,
        producer: 'sls-backend.deliveries',
        version: 1,
        payload: { packageId, reasonCode },
      });

      const result: RequestPackageReturnResult = {
        packageId,
        newStatus: 'RETURN_PENDING',
        reasonCode,
        replayed: false,
      };

      await session.saveOperation({
        id: randomUUID(),
        tenantId,
        requestId,
        actorUserId,
        commandType: 'REQUEST_PACKAGE_RETURN',
        targetId: packageId,
        requestHash: requestId,
        resultSnapshot: result as unknown as Record<string, unknown>,
        createdAt: now,
      });

      return result;
    });
  }
}
