import { DirectedGraph, GraphEdgeId, GraphNodeId } from './directed-graph';

export interface ShortestPathResult {
  readonly nodeIds: readonly GraphNodeId[];
  readonly edgeIds: readonly GraphEdgeId[];
  readonly totalCost: number;
}

export interface ShortestPath {
  find(
    graph: DirectedGraph,
    originNodeId: GraphNodeId,
    destinationNodeId: GraphNodeId,
  ): ShortestPathResult | null;
}
