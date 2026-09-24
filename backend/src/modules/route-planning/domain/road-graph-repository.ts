import { DirectedGraph } from './directed-graph';

export type RoadProfile = 'MOTOR_VEHICLE' | 'MOTORCYCLE' | 'BICYCLE' | 'FOOT';

export type RoadCostMetric = 'DISTANCE' | 'DURATION';

export interface LoadRoadGraphRequest {
  readonly datasetId: string;
  readonly profile: RoadProfile;
  readonly costMetric: RoadCostMetric;
}

export interface RoadGraphSnapshot {
  readonly datasetId: string;
  readonly datasetChecksum: string;
  readonly graph: DirectedGraph;
}

export interface RoadGraphRepository {
  loadReadyGraph(
    request: LoadRoadGraphRequest,
  ): Promise<RoadGraphSnapshot | null>;
}
