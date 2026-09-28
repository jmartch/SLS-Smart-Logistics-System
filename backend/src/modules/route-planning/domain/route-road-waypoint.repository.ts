import { RoadProfile } from './road-graph-repository';

export interface ResolveRouteRoadWaypointsRequest {
  readonly tenantId: string;
  readonly routeId: string;
  readonly profile: RoadProfile;
}

export type ResolveRouteRoadWaypointsResult =
  | { readonly kind: 'ROUTE_NOT_FOUND' }
  | { readonly kind: 'ROUTE_DATASET_REQUIRED' }
  | { readonly kind: 'DEPOT_NOT_CONFIGURED' }
  | { readonly kind: 'DEPOT_ATTACHMENT_NOT_READY' }
  | { readonly kind: 'ROUTE_STOPS_REQUIRED' }
  | {
      readonly kind: 'STOP_ATTACHMENT_NOT_READY';
      readonly routeStopId: string;
    }
  | {
      readonly kind: 'RESOLVED';
      readonly datasetId: string;
      readonly depotNodeId: string;
      readonly orderedStopNodeIds: readonly string[];
    };

export abstract class RouteRoadWaypointRepository {
  abstract resolveRouteWaypoints(
    request: ResolveRouteRoadWaypointsRequest,
  ): Promise<ResolveRouteRoadWaypointsResult>;
}
