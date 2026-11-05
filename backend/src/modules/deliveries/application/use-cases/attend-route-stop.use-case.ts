import { randomUUID } from 'node:crypto';
import { RouteState } from '../../../routes/domain/route-state';
import {
  DeliveryForbiddenError,
  DeliveryNotFoundError,
  DeliveryStateConflictError,
  IdempotencyConflictError,
  StopStateConflictError,
} from '../../domain/delivery-errors';
import type { DeliveryAccessPort } from '../ports/delivery-access.port';
import type { DeliveryUnitOfWork } from '../ports/delivery-unit-of-work';

export interface AttendRouteStopCommand {
  readonly tenantId: string;
  readonly actorUserId: string;
  readonly routeId: string;
  readonly stopId: string;
  readonly requestId: string; // Idempotency-Key
  readonly correlationId?: string;
}

export interface AttendRouteStopResult {
  readonly stopId: string;
  readonly actualArrivalAt: Date;
  readonly affectedPackageIds: readonly string[];
  readonly replayed: boolean;
}

export class AttendRouteStopUseCase {
  constructor(
    private readonly unitOfWork: DeliveryUnitOfWork,
    private readonly accessPort: DeliveryAccessPort,
  ) {}

  async execute(
    command: AttendRouteStopCommand,
  ): Promise<AttendRouteStopResult> {
    const { tenantId, actorUserId, routeId, stopId, requestId } = command;
    const correlationId = command.correlationId ?? randomUUID();

    return this.unitOfWork.run(tenantId, async (session) => {
      // 1. Verificar idempotencia
      const existingOp = await session.findOperation(requestId);
      if (existingOp) {
        if (
          existingOp.commandType !== 'ATTEND_STOP' ||
          existingOp.targetId !== stopId
        ) {
          throw new IdempotencyConflictError(requestId);
        }
        return {
          ...(existingOp.resultSnapshot as unknown as AttendRouteStopResult),
          replayed: true,
        };
      }

      // 2. Cargar y validar la ruta
      const route = await session.lockRoute(routeId);
      if (!route || route.tenantId !== tenantId) {
        throw new DeliveryNotFoundError(routeId, 'Route');
      }

      if (route.state !== RouteState.IN_PROGRESS) {
        throw new DeliveryStateConflictError(
          `Route '${routeId}' is in state '${route.state}', but must be IN_PROGRESS to attend a stop`,
        );
      }

      // 3. Validar permisos del courier
      const canAttend = await this.accessPort.canAttendStop(
        tenantId,
        actorUserId,
        route.courierId,
      );
      if (!canAttend) {
        throw new DeliveryForbiddenError(
          'Only the assigned courier can attend route stops',
        );
      }

      // 4. Cargar y validar la parada
      const stop = await session.lockStop(stopId);
      if (!stop || stop.routeId !== routeId || stop.tenantId !== tenantId) {
        throw new DeliveryNotFoundError(stopId, 'RouteStop');
      }

      if (stop.state !== 'PENDING') {
        throw new StopStateConflictError(
          `Stop '${stopId}' is already in state '${stop.state}' and cannot be attended again`,
        );
      }

      // 5. Cargar paquetes de la parada y pasar de IN_TRANSIT a OUT_FOR_DELIVERY
      const packages = await session.lockStopPackages(stopId);
      const affectedPackageIds: string[] = [];
      const actualArrivalAt = new Date();

      for (const pkg of packages) {
        if (pkg.state === 'IN_TRANSIT') {
          pkg.markOutForDelivery({
            actorUserId,
            correlationId,
            occurredAt: actualArrivalAt,
          });
          await session.savePackage(pkg);
          affectedPackageIds.push(pkg.id);

          await session.recordOutbox({
            eventId: randomUUID(),
            tenantId,
            correlationId,
            eventType: 'PackageOutForDelivery',
            occurredAt: actualArrivalAt,
            producer: 'sls-backend.deliveries',
            version: 1,
            payload: {
              packageId: pkg.id,
              routeId,
              stopId,
            },
          });
        }
      }

      // 6. Registrar llegada en la parada
      await session.updateStopActualTimes(
        stopId,
        actualArrivalAt,
        undefined,
        undefined,
      );

      // 7. Auditoría e idempotencia
      const result: AttendRouteStopResult = {
        stopId,
        actualArrivalAt,
        affectedPackageIds,
        replayed: false,
      };

      await session.recordAudit({
        tenantId,
        actorUserId,
        entityType: 'RouteStop',
        entityId: stopId,
        action: 'ATTEND_STOP',
        details: { affectedPackages: affectedPackageIds.length },
      });

      await session.saveOperation({
        id: randomUUID(),
        tenantId,
        requestId,
        actorUserId,
        commandType: 'ATTEND_STOP',
        targetId: stopId,
        requestHash: requestId,
        resultSnapshot: result as unknown as Record<string, unknown>,
        createdAt: actualArrivalAt,
      });

      return result;
    });
  }
}
