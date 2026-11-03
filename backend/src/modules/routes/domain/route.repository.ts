import { Route } from './route';
import { RouteState } from './route-state';

export interface ListRoutesRepositoryFilter {
  readonly page: number;
  readonly pageSize: number;
  readonly from?: Date;
  readonly to?: Date;
  readonly zoneId?: string;
  readonly state?: RouteState;
  readonly courierId?: string;
}

export interface RouteSummaryProjection {
  readonly id: string;
  readonly tenantId: string;
  readonly state: RouteState;
  readonly vehicleId: string;
  readonly courierId: string;
  readonly depotId?: string | null;
  readonly zoneId?: string | null;
  readonly plannedStartAt?: Date | null;
  readonly plannedEndAt?: Date | null;
  readonly startedAt?: Date | null;
  readonly completedAt?: Date | null;
  readonly stopCount: number;
  readonly vehiclePlate?: string | null;
  readonly courierEmail?: string | null;
  readonly depotName?: string | null;
  readonly zoneName?: string | null;
}

export interface RouteRepository {
  findById(tenantId: string, id: string): Promise<Route | null>;
  save(route: Route): Promise<void>;
  findMany(
    tenantId: string,
    filter: ListRoutesRepositoryFilter,
  ): Promise<{ items: readonly RouteSummaryProjection[]; total: number }>;
}
