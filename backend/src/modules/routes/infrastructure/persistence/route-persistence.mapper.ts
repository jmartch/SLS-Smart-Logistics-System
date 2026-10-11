import {
  Prisma,
  Route as PrismaRoute,
  RouteStop as PrismaRouteStop,
} from '../../../../../generated/prisma/client';
import { Route } from '../../domain/route';
import { RouteStop } from '../../domain/route-stop';

export type PrismaRouteWithStops = PrismaRoute & {
  readonly stops?: readonly PrismaRouteStop[];
};

export class RoutePersistenceMapper {
  static toDomain(raw: PrismaRouteWithStops): Route {
    const rawStops = raw.stops ?? [];
    const domainStops = rawStops.map(
      (s) =>
        new RouteStop({
          id: s.id,
          tenantId: s.tenantId,
          routeId: s.routeId,
          stopNumber: s.sequence,
          latitude: Number(s.latitude),
          longitude: Number(s.longitude),
          state: s.state,
        }),
    );

    return new Route({
      id: raw.id,
      tenantId: raw.tenantId,
      planningRequestId: raw.planningRequestId,
      vehicleId: raw.vehicleId,
      courierId: raw.courierId,
      depotId: raw.depotId,
      state: raw.state,
      plannedAt: raw.plannedAt,
      startedAt: raw.startedAt,
      completedAt: raw.completedAt,
      plannedStartAt: raw.plannedStartAt,
      plannedEndAt: raw.plannedEndAt,
      stops: domainStops,
      dispatchManifestSnapshot: raw.dispatchManifestSnapshot,
    });
  }

  static toRouteCreateInput(route: Route): Prisma.RouteUncheckedCreateInput {
    return {
      id: route.id,
      tenantId: route.tenantId,
      planningRequestId: route.planningRequestId,
      vehicleId: route.vehicleId,
      courierId: route.courierId,
      depotId: route.depotId ?? null,
      state: route.state,
      plannedAt: route.plannedAt,
      startedAt: route.startedAt ?? null,
      completedAt: route.completedAt ?? null,
      plannedStartAt: route.plannedStartAt ?? null,
      plannedEndAt: route.plannedEndAt ?? null,
      dispatchManifestSnapshot:
        (route.dispatchManifestSnapshot as Prisma.InputJsonValue) ?? null,
    };
  }

  static toRouteUpdateInput(route: Route): Prisma.RouteUncheckedUpdateInput {
    return {
      state: route.state,
      startedAt: route.startedAt ?? null,
      completedAt: route.completedAt ?? null,
      plannedStartAt: route.plannedStartAt ?? null,
      plannedEndAt: route.plannedEndAt ?? null,
      ...(route.dispatchManifestSnapshot !== undefined
        ? {
            dispatchManifestSnapshot:
              (route.dispatchManifestSnapshot as Prisma.InputJsonValue) ?? null,
          }
        : {}),
    };
  }

  static toStopCreateInput(
    stop: RouteStop,
  ): Prisma.RouteStopUncheckedCreateInput {
    return {
      id: stop.id,
      tenantId: stop.tenantId,
      routeId: stop.routeId,
      sequence: stop.stopNumber,
      latitude: new Prisma.Decimal(stop.latitude),
      longitude: new Prisma.Decimal(stop.longitude),
      state: stop.state,
    };
  }

  static toStopUpdateInput(
    stop: RouteStop,
  ): Prisma.RouteStopUncheckedUpdateInput {
    return {
      sequence: stop.stopNumber,
      latitude: new Prisma.Decimal(stop.latitude),
      longitude: new Prisma.Decimal(stop.longitude),
      state: stop.state,
    };
  }
}
