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
}
