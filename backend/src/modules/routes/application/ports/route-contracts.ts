import { RouteState } from '../../domain/route-state';
import { RouteStopState } from '../../domain/route-stop-state';

export interface RouteExecutionContext {
  readonly tenantId: string;
  readonly actorUserId: string;
  readonly correlationId: string;
}

export interface PrepareRouteCommand extends RouteExecutionContext {
  readonly routeId: string;
  readonly depotConfirmed: boolean;
}

export interface StartRouteCommand extends RouteExecutionContext {
  readonly routeId: string;
}

export interface CancelRouteCommand extends RouteExecutionContext {
  readonly routeId: string;
  readonly reasonCode: string;
  readonly reason?: string;
}

export interface InterruptRouteCommand extends RouteExecutionContext {
  readonly routeId: string;
  readonly reasonCode: string;
  readonly reason?: string;
}

export interface GetRouteDetailQuery extends RouteExecutionContext {
  readonly routeId: string;
}

export interface ListRoutesQuery extends RouteExecutionContext {
  readonly page?: number;
  readonly pageSize?: number;
  readonly from?: string;
  readonly to?: string;
  readonly zoneId?: string;
  readonly state?: RouteState;
  readonly courierId?: string;
}

export interface RouteOperationResult {
  readonly routeId: string;
  readonly state: RouteState;
  readonly updatedPackagesCount: number;
  readonly correlationId: string;
  readonly startedAt?: string | null;
}

export interface RouteDetailStopResult {
  readonly id: string;
  readonly stopNumber: number;
  readonly latitude: number;
  readonly longitude: number;
  readonly state: RouteStopState;
}

export interface RouteDetailResult {
  readonly id: string;
  readonly tenantId: string;
  readonly state: RouteState;
  readonly vehicleId: string;
  readonly courierId: string;
  readonly depotId?: string | null;
  readonly plannedStartAt?: string | null;
  readonly plannedEndAt?: string | null;
  readonly startedAt?: string | null;
  readonly completedAt?: string | null;
  readonly stops: readonly RouteDetailStopResult[];
}

export interface RouteSummaryItemResult {
  readonly id: string;
  readonly tenantId: string;
  readonly state: RouteState;
  readonly vehicleId: string;
  readonly courierId: string;
  readonly depotId?: string | null;
  readonly zoneId?: string | null;
  readonly plannedStartAt?: string | null;
  readonly plannedEndAt?: string | null;
  readonly startedAt?: string | null;
  readonly completedAt?: string | null;
  readonly stopCount: number;
}

export interface PaginatedRoutesResult {
  readonly items: readonly RouteSummaryItemResult[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}
