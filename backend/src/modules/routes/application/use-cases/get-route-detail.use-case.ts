import {
  RouteForbiddenError,
  RouteNotFoundError,
} from '../../domain/route-errors';
import { RouteRepository } from '../../domain/route.repository';
import { RouteAccessPort } from '../ports/route-access.port';
import {
  GetRouteDetailQuery,
  RouteDetailResult,
  RouteDetailStopResult,
} from '../ports/route-contracts';

export class GetRouteDetailUseCase {
  constructor(
    private readonly routeRepository: RouteRepository,
    private readonly accessPort: RouteAccessPort,
  ) {}

  async execute(query: GetRouteDetailQuery): Promise<RouteDetailResult> {
    const route = await this.routeRepository.findById(
      query.tenantId,
      query.routeId,
    );
    if (!route) {
      throw new RouteNotFoundError(query.routeId);
    }

    const canView = await this.accessPort.canViewRoute(
      query.tenantId,
      query.actorUserId,
      route.courierId,
    );
    if (!canView) {
      throw new RouteForbiddenError(
        'Actor is not authorized to view this route',
      );
    }

    // Consume GoF RouteStopIterator to traverse ordered stops without exposing internal array
    const iterator = route.createIterator();
    const stops: RouteDetailStopResult[] = [];

    while (iterator.hasNext()) {
      const stop = iterator.next();
      if (stop) {
        stops.push({
          id: stop.id,
          stopNumber: stop.stopNumber,
          latitude: stop.latitude,
          longitude: stop.longitude,
          state: stop.state,
        });
      }
    }

    return {
      id: route.id,
      tenantId: route.tenantId,
      state: route.state,
      vehicleId: route.vehicleId,
      courierId: route.courierId,
      depotId: route.depotId,
      plannedStartAt: route.plannedStartAt
        ? route.plannedStartAt.toISOString()
        : null,
      plannedEndAt: route.plannedEndAt
        ? route.plannedEndAt.toISOString()
        : null,
      startedAt: route.startedAt ? route.startedAt.toISOString() : null,
      completedAt: route.completedAt ? route.completedAt.toISOString() : null,
      stops: Object.freeze(stops),
    };
  }
}
