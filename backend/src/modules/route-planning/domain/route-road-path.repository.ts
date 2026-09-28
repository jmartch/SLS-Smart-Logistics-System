import { GraphEdgeId, GraphNodeId } from './directed-graph';
import { RoadProfile } from './road-graph-repository';

export interface RouteRoadLegPlan {
  readonly sequence: number;
  readonly fromNodeId: GraphNodeId;
  readonly toNodeId: GraphNodeId;
  readonly edgeIds: readonly GraphEdgeId[];
}

export interface ReplaceRouteRoadPathRequest {
  readonly tenantId: string;
  readonly routeId: string;
  readonly datasetId: string;
  readonly profile: RoadProfile;
  readonly legs: readonly RouteRoadLegPlan[];
}

export type ReplaceRouteRoadPathResult =
  | { readonly kind: 'ROUTE_NOT_FOUND' }
  | { readonly kind: 'ROUTE_DATASET_MISMATCH' }
  | { readonly kind: 'ROUTE_NOT_PLANNABLE' }
  | { readonly kind: 'DATASET_NOT_READY' }
  | {
      readonly kind: 'PERSISTED';
      readonly legCount: number;
      readonly totalDistanceM: number;
      readonly totalDurationS: number;
    };

export abstract class RouteRoadPathRepository {
  abstract replaceRouteRoadPath(
    request: ReplaceRouteRoadPathRequest,
  ): Promise<ReplaceRouteRoadPathResult>;
}
