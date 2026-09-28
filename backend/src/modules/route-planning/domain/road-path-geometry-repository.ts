import { GraphEdgeId } from './directed-graph';

export type LongitudeLatitude = readonly [longitude: number, latitude: number];

export interface RoadEdgeGeometry {
  readonly edgeId: GraphEdgeId;
  readonly coordinates: readonly LongitudeLatitude[];
}

export interface RoadPathGeometryRepository {
  loadOrderedGeometries(
    datasetId: string,
    edgeIds: readonly GraphEdgeId[],
  ): Promise<readonly RoadEdgeGeometry[]>;
}
