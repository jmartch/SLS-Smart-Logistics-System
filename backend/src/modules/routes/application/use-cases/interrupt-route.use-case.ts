import { RouteState } from '../../domain/route-state';
import {
  RouteForbiddenError,
  RouteNotFoundError,
  RouteStateConflictError,
  RouteValidationError,
} from '../../domain/route-errors';
import { RouteLifecycleUnitOfWork } from '../ports/route-lifecycle-unit-of-work.port';
import { RouteAccessPort } from '../ports/route-access.port';
import {
  InterruptRouteCommand,
  RouteOperationResult,
} from '../ports/route-contracts';

export class InterruptRouteUseCase {
  constructor(
    private readonly unitOfWork: RouteLifecycleUnitOfWork,
    private readonly accessPort: RouteAccessPort,
  ) { }

  async execute(command: InterruptRouteCommand): Promise<RouteOperationResult> {
    if (!command.reasonCode || !command.reasonCode.trim()) {
      throw new RouteValidationError('Interruption reasonCode is mandatory');
    }

    return await this.unitOfWork.executeInTransaction(
      command.tenantId,
      async (session) => {
        const route = await session.routes.findById(
          command.tenantId,
          command.routeId,
        );
        if (!route) {
          throw new RouteNotFoundError(command.routeId);
        }

        const canInterrupt = await this.accessPort.canInterruptRoute(
          command.tenantId,
          command.actorUserId,
          route.courierId,
        );
        if (!canInterrupt) {
          throw new RouteForbiddenError(
            'Actor is not authorized to interrupt this route',
          );
        }

        if (route.state !== RouteState.IN_PROGRESS) {
          throw new RouteStateConflictError(route.id, route.state, 'interrupt');
        }

        const previousState = route.state;

        route.interrupt(command.reasonCode, command.reason, {
          actorUserId: command.actorUserId,
          correlationId: command.correlationId,
        });

        await session.routes.save(route);

        // In accordance with ADR-006 (D3):
        // Flota y mensajero siguen físicamente comprometidos en la calle.
        // No se cancelan las asignaciones ni se modifican los estados de los paquetes.

        const now = new Date();
        await session.audit.recordAuditLog({
          tenantId: command.tenantId,
          actorUserId: command.actorUserId,
          action: 'ROUTE_INTERRUPTED',
          entityType: 'ROUTE',
          entityId: route.id,
          previousState,
          newState: RouteState.INTERRUPTED,
          correlationId: command.correlationId,
          timestamp: now,
          details: {
            reasonCode: command.reasonCode,
            reason: command.reason,
          },
        });

        const domainEvents = route.pullDomainEvents();
        const outboxEntries = domainEvents.map((evt) => ({
          eventId: evt.eventId,
          tenantId: evt.tenantId,
          correlationId: command.correlationId,
          eventType: evt.eventType,
          occurredAt: evt.occurredAt,
          producer: evt.producer,
          version: evt.version,
          payload: { ...evt },
        }));

        if (outboxEntries.length > 0) {
          await session.outbox.recordEvents(outboxEntries);
        }

        return {
          routeId: route.id,
          state: route.state,
          updatedPackagesCount: 0,
          correlationId: command.correlationId,
        };
      },
    );
  }
}
