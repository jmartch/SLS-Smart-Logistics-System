import {
  FindRoadPathLegRequest,
  FindRoadPathService,
} from './find-road-path.service';
import { RoadCostMetric, RoadProfile } from '../domain/road-graph-repository';
import {
  ReplaceRouteRoadPathResult,
  RouteRoadPathRepository,
} from '../domain/route-road-path.repository';

export interface BuildRouteRoadPathCommand {
  // tenantId must come from authenticated identity or trusted event metadata.
  readonly tenantId: string;
  readonly routeId: string;
  readonly datasetId: string;
  readonly profile: RoadProfile;
  readonly costMetric: RoadCostMetric;
  readonly depotNodeId: string;
  readonly orderedStopNodeIds: readonly string[];
}

export type BuildRouteRoadPathResult =
  | { readonly kind: 'INVALID_ROUTE_PLAN'; readonly reason: string }
  | { readonly kind: 'DATASET_NOT_READY' }
  | {
      readonly kind: 'PATH_NOT_FOUND';
      readonly sequence: number;
      readonly originNodeId: string;
      readonly destinationNodeId: string;
    }
  | Exclude<ReplaceRouteRoadPathResult, { readonly kind: 'PERSISTED' }>
  | ({ readonly datasetChecksum: string } & Extract<
      ReplaceRouteRoadPathResult,
      { readonly kind: 'PERSISTED' }
    >);

export class BuildRouteRoadPathService {
  constructor(
    private readonly pathFinder: FindRoadPathService,
    private readonly repository: RouteRoadPathRepository,
  ) {}

  async execute(
    command: BuildRouteRoadPathCommand,
  ): Promise<BuildRouteRoadPathResult> {
    if (command.depotNodeId.trim().length === 0) {
      return { kind: 'INVALID_ROUTE_PLAN', reason: 'DEPOT_NODE_REQUIRED' };
    }

    if (command.orderedStopNodeIds.length === 0) {
      return { kind: 'INVALID_ROUTE_PLAN', reason: 'ROUTE_STOPS_REQUIRED' };
    }

    if (
      command.orderedStopNodeIds.some((nodeId) => nodeId.trim().length === 0)
    ) {
      return { kind: 'INVALID_ROUTE_PLAN', reason: 'STOP_NODE_REQUIRED' };
    }

    const waypointNodeIds = [
      command.depotNodeId,
      ...command.orderedStopNodeIds,
      command.depotNodeId,
    ];
    const legs: FindRoadPathLegRequest[] = waypointNodeIds
      .slice(0, -1)
      .map((originNodeId, index) => ({
        sequence: index + 1,
        originNodeId,
        destinationNodeId: waypointNodeIds[index + 1],
      }));

    const found = await this.pathFinder.findMany({
      datasetId: command.datasetId,
      profile: command.profile,
      costMetric: command.costMetric,
      legs,
    });

    if (found.kind !== 'FOUND') {
      return found;
    }

    const persisted = await this.repository.replaceRouteRoadPath({
      tenantId: command.tenantId,
      routeId: command.routeId,
      datasetId: found.datasetId,
      profile: command.profile,
      legs: found.legs.map((leg) => ({
        sequence: leg.sequence,
        fromNodeId: leg.originNodeId,
        toNodeId: leg.destinationNodeId,
        edgeIds: leg.path.edgeIds,
      })),
    });

    if (persisted.kind !== 'PERSISTED') {
      return persisted;
    }

    return { ...persisted, datasetChecksum: found.datasetChecksum };
  }
}
