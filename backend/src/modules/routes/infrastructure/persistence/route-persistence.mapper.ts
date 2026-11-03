import {
  Prisma,
  Route as PrismaRoute,
  RouteStop as PrismaRouteStop,
} from '../../../../../generated/prisma/client';
import { Route } from '../../domain/route';
import { RouteStop } from '../../domain/route-stop';

export type PrismaRouteWithStops = PrismaRoute & {
  readonly stops?: readonly (PrismaRouteStop & {
    readonly assignments?: readonly {
      readonly package?: {
        readonly id: string;
        readonly trackingCode: string;
        readonly address?: {
          readonly originalText: string;
        } | null;
      } | null;
    }[];
  })[];
  readonly vehicle?: { readonly plate: string } | null;
  readonly courier?: { readonly user?: { readonly email: string } | null } | null;
  readonly depot?: { readonly name: string } | null;
  readonly planningRequest?: { readonly parameters?: unknown } | null;
};

export class RoutePersistenceMapper {
  static toDomain(raw: PrismaRouteWithStops, zoneName?: string | null): Route {
    const rawStops = raw.stops ?? [];
    const domainStops = rawStops.map((s) => {
      const assignment = s.assignments?.[0];
      const pkg = assignment?.package;
      return new RouteStop({
        id: s.id,
        tenantId: s.tenantId,
        routeId: s.routeId,
        stopNumber: s.sequence,
        latitude: Number(s.latitude),
        longitude: Number(s.longitude),
        state: s.state,
        packageId: pkg?.id ?? null,
        trackingCode: pkg?.trackingCode ?? null,
        address: pkg?.address?.originalText ?? null,
      });
    });

    const params = raw.planningRequest?.parameters as
      Record<string, unknown> | null | undefined;
    const zoneId =
      typeof params?.zoneId === 'string' ? params.zoneId : null;

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
      vehiclePlate: raw.vehicle?.plate ?? null,
      courierEmail: raw.courier?.user?.email ?? null,
      depotName: raw.depot?.name ?? null,
      zoneId,
      zoneName: zoneName ?? null,
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
