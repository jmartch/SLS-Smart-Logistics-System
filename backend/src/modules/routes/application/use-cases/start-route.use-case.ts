import { RouteState } from '../../domain/route-state';
import {
  RouteForbiddenError,
  RouteNotFoundError,
  RouteResourceUnavailableError,
  RouteStateConflictError,
} from '../../domain/route-errors';
import { RouteLifecycleUnitOfWork } from '../ports/route-lifecycle-unit-of-work';
import { RouteAccessPort } from '../ports/route-access.port';
import { RouteResourcesPort } from '../ports/route-resources.port';
import {
  StartRouteCommand,
  RouteOperationResult,
} from '../ports/route-contracts';

export class StartRouteUseCase {
  constructor(
    private readonly unitOfWork: RouteLifecycleUnitOfWork,
    private readonly accessPort: RouteAccessPort,
    private readonly resourcesPort: RouteResourcesPort,
  ) {}

  async execute(command: StartRouteCommand): Promise<RouteOperationResult> {
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

        const canStart = await this.accessPort.canStartRoute(
          command.tenantId,
          command.actorUserId,
          route.courierId,
        );
        if (!canStart) {
          throw new RouteForbiddenError();
        }

        if (route.state !== RouteState.READY) {
          throw new RouteStateConflictError(route.id, route.state, 'start');
        }

        const resourceCheck =
          await this.resourcesPort.validateResourcesForRoute(
            command.tenantId,
            route.id,
            route.vehicleId,
            route.courierId,
            route.depotId,
            route.plannedStartAt,
            route.plannedEndAt,
          );
        if (!resourceCheck.isValid) {
          throw new RouteResourceUnavailableError(
            'COURIER',
            route.courierId,
            resourceCheck.reason ??
              'Courier or vehicle resource is unavailable',
          );
        }

        const now = new Date();
        route.start({
          now,
          actorUserId: command.actorUserId,
          correlationId: command.correlationId,
        });

        const packages = await session.packages.findPackagesByRouteId(
          command.tenantId,
          route.id,
        );

        const stateUpdates = packages.map((pkg) => ({
          packageId: pkg.id,
          previousState: pkg.currentState,
          nextState: 'IN_TRANSIT',
        }));

        const histories = packages.map((pkg) => ({
          packageId: pkg.id,
          previousState: pkg.currentState,
          nextState: 'IN_TRANSIT',
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

        await session.audit.recordAuditLog({
          tenantId: command.tenantId,
          actorUserId: command.actorUserId,
          action: 'ROUTE_STARTED',
          entityType: 'ROUTE',
          entityId: route.id,
          previousState: RouteState.READY,
          newState: RouteState.IN_PROGRESS,
          correlationId: command.correlationId,
          timestamp: now,
          details: { updatedPackagesCount: packages.length },
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
          updatedPackagesCount: packages.length,
          correlationId: command.correlationId,
          startedAt: now.toISOString(),
        };
      },
    );
  }
}
