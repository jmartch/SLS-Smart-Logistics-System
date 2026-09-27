export type GraphNodeId = string;
export type GraphEdgeId = string;

export interface GraphNode {
  readonly id: GraphNodeId;
}

export interface GraphEdge {
  readonly id: GraphEdgeId;
  readonly fromNodeId: GraphNodeId;
  readonly toNodeId: GraphNodeId;
  readonly cost: number;
}

export interface DirectedGraph {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
}
