import {
  DirectedGraph,
  GraphEdge,
  GraphEdgeId,
  GraphNodeId,
} from './directed-graph';
import { ShortestPath, ShortestPathResult } from './shortest-path';

interface PreviousStep {
  readonly nodeId: GraphNodeId;
  readonly edgeId: GraphEdgeId;
}

export class DijkstraShortestPath implements ShortestPath {
  find(
    graph: DirectedGraph,
    originNodeId: GraphNodeId,
    destinationNodeId: GraphNodeId,
  ): ShortestPathResult | null {
    const nodeIds = new Set(graph.nodes.map((node) => node.id));

    if (nodeIds.size !== graph.nodes.length) {
      throw new Error('DUPLICATE_NODE_ID');
    }

    if (!nodeIds.has(originNodeId)) {
      throw new Error('ORIGIN_NODE_NOT_FOUND');
    }

    if (!nodeIds.has(destinationNodeId)) {
      throw new Error('DESTINATION_NODE_NOT_FOUND');
    }

    if (originNodeId === destinationNodeId) {
      return {
        nodeIds: [originNodeId],
        edgeIds: [],
        totalCost: 0,
      };
    }

    const adjacency = this.buildAdjacency(graph, nodeIds);
    const orderedNodeIds = [...nodeIds].sort();

    const distances = new Map<GraphNodeId, number>();
    const previous = new Map<GraphNodeId, PreviousStep>();
    const visited = new Set<GraphNodeId>();

    for (const nodeId of orderedNodeIds) {
      distances.set(nodeId, Number.POSITIVE_INFINITY);
    }

    distances.set(originNodeId, 0);

    while (visited.size < orderedNodeIds.length) {
      const currentNodeId = this.findClosestUnvisitedNode(
        orderedNodeIds,
        distances,
        visited,
      );

      if (currentNodeId === null) {
        break;
      }

      const currentDistance = distances.get(currentNodeId);

      if (
        currentDistance === undefined ||
        currentDistance === Number.POSITIVE_INFINITY
      ) {
        break;
      }

      if (currentNodeId === destinationNodeId) {
        break;
      }

      visited.add(currentNodeId);

      const outgoingEdges = adjacency.get(currentNodeId) ?? [];

      for (const edge of outgoingEdges) {
        if (visited.has(edge.toNodeId)) {
          continue;
        }

        const candidateDistance = currentDistance + edge.cost;
        const knownDistance = distances.get(edge.toNodeId);

        if (knownDistance === undefined || candidateDistance < knownDistance) {
          distances.set(edge.toNodeId, candidateDistance);
          previous.set(edge.toNodeId, {
            nodeId: currentNodeId,
            edgeId: edge.id,
          });
        }
      }
    }

    const totalCost = distances.get(destinationNodeId);

    if (totalCost === undefined || !Number.isFinite(totalCost)) {
      return null;
    }

    return this.reconstructPath(
      originNodeId,
      destinationNodeId,
      totalCost,
      previous,
    );
  }

  private buildAdjacency(
    graph: DirectedGraph,
    nodeIds: ReadonlySet<GraphNodeId>,
  ): Map<GraphNodeId, GraphEdge[]> {
    const adjacency = new Map<GraphNodeId, GraphEdge[]>();
    const edgeIds = new Set<GraphEdgeId>();

    for (const nodeId of nodeIds) {
      adjacency.set(nodeId, []);
    }

    for (const edge of graph.edges) {
      if (edgeIds.has(edge.id)) {
        throw new Error('DUPLICATE_EDGE_ID');
      }

      edgeIds.add(edge.id);

      if (!nodeIds.has(edge.fromNodeId) || !nodeIds.has(edge.toNodeId)) {
        throw new Error('EDGE_NODE_NOT_FOUND');
      }

      if (!Number.isFinite(edge.cost) || edge.cost < 0) {
        throw new Error('INVALID_EDGE_COST');
      }

      adjacency.get(edge.fromNodeId)?.push(edge);
    }

    for (const edges of adjacency.values()) {
      edges.sort((first, second) => {
        const nodeComparison = first.toNodeId.localeCompare(second.toNodeId);

        if (nodeComparison !== 0) {
          return nodeComparison;
        }

        if (first.cost !== second.cost) {
          return first.cost - second.cost;
        }

        return first.id.localeCompare(second.id);
      });
    }

    return adjacency;
  }

  private findClosestUnvisitedNode(
    orderedNodeIds: readonly GraphNodeId[],
    distances: ReadonlyMap<GraphNodeId, number>,
    visited: ReadonlySet<GraphNodeId>,
  ): GraphNodeId | null {
    let closestNodeId: GraphNodeId | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;

    for (const nodeId of orderedNodeIds) {
      if (visited.has(nodeId)) {
        continue;
      }

      const distance = distances.get(nodeId);

      if (distance !== undefined && distance < closestDistance) {
        closestNodeId = nodeId;
        closestDistance = distance;
      }
    }

    return closestNodeId;
  }

  private reconstructPath(
    originNodeId: GraphNodeId,
    destinationNodeId: GraphNodeId,
    totalCost: number,
    previous: ReadonlyMap<GraphNodeId, PreviousStep>,
  ): ShortestPathResult | null {
    const nodeIds: GraphNodeId[] = [destinationNodeId];
    const edgeIds: GraphEdgeId[] = [];

    let currentNodeId = destinationNodeId;

    while (currentNodeId !== originNodeId) {
      const step = previous.get(currentNodeId);

      if (step === undefined) {
        return null;
      }

      edgeIds.push(step.edgeId);
      currentNodeId = step.nodeId;
      nodeIds.push(currentNodeId);
    }

    nodeIds.reverse();
    edgeIds.reverse();

    return {
      nodeIds,
      edgeIds,
      totalCost,
    };
  }
}
