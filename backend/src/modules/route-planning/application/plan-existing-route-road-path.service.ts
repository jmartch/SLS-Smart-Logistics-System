import {
  BuildRouteRoadPathResult,
  BuildRouteRoadPathService,
} from './build-route-road-path.service';
import { RoadCostMetric, RoadProfile } from '../domain/road-graph-repository';
import {
  ResolveRouteRoadWaypointsResult,
  RouteRoadWaypointRepository,
} from '../domain/route-road-waypoint.repository';

export interface PlanExistingRouteRoadPathCommand {
  // tenantId must come from authenticated identity or trusted event metadata.
  readonly tenantId: string;
  readonly routeId: string;
  readonly profile: RoadProfile;
  readonly costMetric: RoadCostMetric;
}

type WaypointFailure = Exclude<
  ResolveRouteRoadWaypointsResult,
  { readonly kind: 'RESOLVED' }
>;

export type PlanExistingRouteRoadPathResult =
  WaypointFailure | BuildRouteRoadPathResult;

export class PlanExistingRouteRoadPathService {
  constructor(
    private readonly waypoints: RouteRoadWaypointRepository,
    private readonly routePathBuilder: BuildRouteRoadPathService,
  ) {}

  async execute(
    command: PlanExistingRouteRoadPathCommand,
  ): Promise<PlanExistingRouteRoadPathResult> {
    const resolved = await this.waypoints.resolveRouteWaypoints({
      tenantId: command.tenantId,
      routeId: command.routeId,
      profile: command.profile,
    });

    if (resolved.kind !== 'RESOLVED') {
      return resolved;
    }

    return this.routePathBuilder.execute({
      tenantId: command.tenantId,
      routeId: command.routeId,
      datasetId: resolved.datasetId,
      profile: command.profile,
      costMetric: command.costMetric,
      depotNodeId: resolved.depotNodeId,
      orderedStopNodeIds: resolved.orderedStopNodeIds,
    });
  }
}
