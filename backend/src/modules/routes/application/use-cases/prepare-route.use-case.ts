import { RouteState } from '../../domain/route-state';
import {
  RouteForbiddenError,
  RouteManifestInvalidError,
  RouteNotFoundError,
  RouteResourceUnavailableError,
  RouteStateConflictError,
  RouteValidationError,
} from '../../domain/route-errors';
import { RouteLifecycleUnitOfWork } from '../ports/route-lifecycle-unit-of-work.port';
import { RouteAccessPort } from '../ports/route-access.port';
import { RouteResourcesPort } from '../ports/route-resources.port';
import {
  PrepareRouteCommand,
  RouteOperationResult,
} from '../ports/route-contracts';

export class PrepareRouteUseCase {
  constructor(
    private readonly unitOfWork: RouteLifecycleUnitOfWork,
    private readonly accessPort: RouteAccessPort,
    private readonly resourcesPort: RouteResourcesPort,
  ) { }

  async execute(command: PrepareRouteCommand): Promise<RouteOperationResult> {
    if (!command.depotConfirmed) {
      throw new RouteValidationError(
        'Depot presence must be confirmed (depotConfirmed: true)',
      );
    }

    const canPrepare = await this.accessPort.canPrepareRoute(
      command.tenantId,
      command.actorUserId,
    );
    if (!canPrepare) {
      throw new RouteForbiddenError();
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

        if (route.state !== RouteState.PLANNED) {
          throw new RouteStateConflictError(route.id, route.state, 'prepare');
        }

        if (route.stops.length === 0) {
          throw new RouteManifestInvalidError(
            'Cannot prepare an empty route with zero stops',
          );
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
            'VEHICLE',
            route.vehicleId,
            resourceCheck.reason ?? 'Vehicle or fleet resource is unavailable',
          );
        }

        const packages = await session.packages.findPackagesByRouteId(
          command.tenantId,
          route.id,
        );

        route.prepare({
          actorUserId: command.actorUserId,
          correlationId: command.correlationId,
        });

        const now = new Date();
        const stateUpdates = packages.map((pkg) => ({
          packageId: pkg.id,
          previousState: pkg.currentState,
          nextState: 'READY_FOR_DISPATCH',
        }));

        const histories = packages.map((pkg) => ({
          packageId: pkg.id,
          previousState: pkg.currentState,
          nextState: 'READY_FOR_DISPATCH',
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
          action: 'ROUTE_PREPARED',
          entityType: 'ROUTE',
          entityId: route.id,
          previousState: RouteState.PLANNED,
          newState: RouteState.READY,
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
        };
      },
    );
  }
}
