import { GraphNodeId } from '../domain/directed-graph';
import {
  RoadCostMetric,
  RoadGraphRepository,
  RoadProfile,
} from '../domain/road-graph-repository';
import {
  RoadEdgeGeometry,
  RoadPathGeometryRepository,
} from '../domain/road-path-geometry-repository';
import { ShortestPath, ShortestPathResult } from '../domain/shortest-path';

export interface FindRoadPathRequest {
  readonly datasetId: string;
  readonly profile: RoadProfile;
  readonly costMetric: RoadCostMetric;
  readonly originNodeId: GraphNodeId;
  readonly destinationNodeId: GraphNodeId;
}

export interface FindRoadPathLegRequest {
  readonly sequence: number;
  readonly originNodeId: GraphNodeId;
  readonly destinationNodeId: GraphNodeId;
}

export interface FindRoadPathsRequest {
  readonly datasetId: string;
  readonly profile: RoadProfile;
  readonly costMetric: RoadCostMetric;
  readonly legs: readonly FindRoadPathLegRequest[];
}

export interface FoundRoadPathLeg extends FindRoadPathLegRequest {
  readonly path: ShortestPathResult;
  readonly geometries: readonly RoadEdgeGeometry[];
}

export type FindRoadPathsResult =
  | { readonly kind: 'DATASET_NOT_READY' }
  | {
      readonly kind: 'PATH_NOT_FOUND';
      readonly sequence: number;
      readonly originNodeId: GraphNodeId;
      readonly destinationNodeId: GraphNodeId;
    }
  | {
      readonly kind: 'FOUND';
      readonly datasetId: string;
      readonly datasetChecksum: string;
      readonly legs: readonly FoundRoadPathLeg[];
    };

export type FindRoadPathResult =
  | { readonly kind: 'DATASET_NOT_READY' }
  | { readonly kind: 'PATH_NOT_FOUND' }
  | {
      readonly kind: 'FOUND';
      readonly datasetId: string;
      readonly datasetChecksum: string;
      readonly path: ShortestPathResult;
      readonly geometries: readonly RoadEdgeGeometry[];
    };

export class FindRoadPathService {
  constructor(
    private readonly repository: RoadGraphRepository,
    private readonly shortestPath: ShortestPath,
    private readonly geometryRepository: RoadPathGeometryRepository,
  ) {}

  async find(request: FindRoadPathRequest): Promise<FindRoadPathResult> {
    const snapshot = await this.repository.loadReadyGraph({
      datasetId: request.datasetId,
      profile: request.profile,
      costMetric: request.costMetric,
    });

    if (snapshot === null) {
      return { kind: 'DATASET_NOT_READY' };
    }

    const path = this.shortestPath.find(
      snapshot.graph,
      request.originNodeId,
      request.destinationNodeId,
    );

    if (path === null) {
      return { kind: 'PATH_NOT_FOUND' };
    }

    const geometries = await this.geometryRepository.loadOrderedGeometries(
      snapshot.datasetId,
      path.edgeIds,
    );

    return {
      kind: 'FOUND',
      datasetId: snapshot.datasetId,
      datasetChecksum: snapshot.datasetChecksum,
      geometries,
      path,
    };
  }

  async findMany(request: FindRoadPathsRequest): Promise<FindRoadPathsResult> {
    const snapshot = await this.repository.loadReadyGraph({
      datasetId: request.datasetId,
      profile: request.profile,
      costMetric: request.costMetric,
    });

    if (snapshot === null) {
      return { kind: 'DATASET_NOT_READY' };
    }

    const calculated = request.legs.map((leg) => ({
      ...leg,
      path: this.shortestPath.find(
        snapshot.graph,
        leg.originNodeId,
        leg.destinationNodeId,
      ),
    }));
    const missing = calculated.find((leg) => leg.path === null);

    if (missing !== undefined) {
      return {
        kind: 'PATH_NOT_FOUND',
        sequence: missing.sequence,
        originNodeId: missing.originNodeId,
        destinationNodeId: missing.destinationNodeId,
      };
    }

    const legs = await Promise.all(
      calculated.map(async (leg): Promise<FoundRoadPathLeg> => {
        const path = leg.path;
        if (path === null) {
          throw new Error('ROAD_PATH_DISAPPEARED');
        }

        return {
          sequence: leg.sequence,
          originNodeId: leg.originNodeId,
          destinationNodeId: leg.destinationNodeId,
          path,
          geometries: await this.geometryRepository.loadOrderedGeometries(
            snapshot.datasetId,
            path.edgeIds,
          ),
        };
      }),
    );

    return {
      kind: 'FOUND',
      datasetId: snapshot.datasetId,
      datasetChecksum: snapshot.datasetChecksum,
      legs,
    };
  }
}
