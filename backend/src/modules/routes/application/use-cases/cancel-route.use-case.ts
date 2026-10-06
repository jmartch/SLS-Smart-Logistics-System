import { RouteState } from '../../domain/route-state';
import {
  RouteForbiddenError,
  RouteNotFoundError,
  RouteStateConflictError,
  RouteValidationError,
} from '../../domain/route-errors';
import { RouteLifecycleUnitOfWork } from '../ports/route-lifecycle-unit-of-work';
import { RouteAccessPort } from '../ports/route-access.port';
import {
  CancelRouteCommand,
  RouteOperationResult,
} from '../ports/route-contracts';

export class CancelRouteUseCase {
  constructor(
    private readonly unitOfWork: RouteLifecycleUnitOfWork,
    private readonly accessPort: RouteAccessPort,
  ) {}

  async execute(command: CancelRouteCommand): Promise<RouteOperationResult> {
    if (!command.reasonCode || !command.reasonCode.trim()) {
      throw new RouteValidationError('Cancellation reasonCode is mandatory');
    }

    const canCancel = await this.accessPort.canCancelRoute(
      command.tenantId,
      command.actorUserId,
    );
    if (!canCancel) {
      throw new RouteForbiddenError('Actor is not authorized to cancel routes');
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

        if (
          route.state !== RouteState.PLANNED &&
          route.state !== RouteState.READY
        ) {
          throw new RouteStateConflictError(route.id, route.state, 'cancel');
        }

        const previousState = route.state;
        const packages = await session.packages.findPackagesByRouteId(
          command.tenantId,
          route.id,
        );

        route.cancel(command.reasonCode, command.reason, {
          actorUserId: command.actorUserId,
          correlationId: command.correlationId,
        });

        const now = new Date();

        // 1. Cancel active assignments for this route
        await session.assignments.cancelAssignmentsByRouteId(
          command.tenantId,
          route.id,
          command.reasonCode,
          now,
        );

        // 2. Revert packages to PENDING_ASSIGNMENT
        const stateUpdates = packages.map((pkg) => ({
          packageId: pkg.id,
          previousState: pkg.currentState,
          nextState: 'PENDING_ASSIGNMENT',
        }));

        const histories = packages.map((pkg) => ({
          packageId: pkg.id,
          previousState: pkg.currentState,
          nextState: 'PENDING_ASSIGNMENT',
          reasonCode: command.reasonCode,
          changedByUserId: command.actorUserId,
          changedAt: now,
        }));

        await session.routes.save(route);

        if (stateUpdates.length > 0) {
          await session.packages.updatePackageStates(
            command.tenantId,
            stateUpdates,
          );
        }

        if (histories.length > 0) {
          await session.packages.recordStatusHistories(
            command.tenantId,
            histories,
          );
        }

        // 3. Record audit log
        await session.audit.recordAuditLog({
          tenantId: command.tenantId,
          actorUserId: command.actorUserId,
          action: 'ROUTE_CANCELLED',
          entityType: 'ROUTE',
          entityId: route.id,
          previousState,
          newState: RouteState.CANCELLED,
          correlationId: command.correlationId,
          timestamp: now,
          details: {
            reasonCode: command.reasonCode,
            reason: command.reason,
            revertedPackagesCount: packages.length,
          },
        });

        // 4. Save outbox events
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
          updatedPackagesCount: packages.length,
          correlationId: command.correlationId,
        };
      },
    );
  }
}
