import { DirectedGraph } from '../domain/directed-graph';
import { DijkstraShortestPath } from '../domain/dijkstra-shortest-path';

describe('DijkstraShortestPath', () => {
  const algorithm = new DijkstraShortestPath();

  it('finds the lowest-cost directed path', () => {
    const graph: DirectedGraph = {
      nodes: [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }, { id: 'E' }],
      edges: [
        {
          id: 'edge-a-b',
          fromNodeId: 'A',
          toNodeId: 'B',
          cost: 4,
        },
        {
          id: 'edge-a-c',
          fromNodeId: 'A',
          toNodeId: 'C',
          cost: 1,
        },
        {
          id: 'edge-c-b',
          fromNodeId: 'C',
          toNodeId: 'B',
          cost: 2,
        },
        {
          id: 'edge-b-d',
          fromNodeId: 'B',
          toNodeId: 'D',
          cost: 1,
        },
        {
          id: 'edge-c-d',
          fromNodeId: 'C',
          toNodeId: 'D',
          cost: 5,
        },
      ],
    };

    expect(algorithm.find(graph, 'A', 'D')).toEqual({
      nodeIds: ['A', 'C', 'B', 'D'],
      edgeIds: ['edge-a-c', 'edge-c-b', 'edge-b-d'],
      totalCost: 4,
    });
  });

  it('does not travel against the direction of an edge', () => {
    const graph: DirectedGraph = {
      nodes: [{ id: 'A' }, { id: 'B' }],
      edges: [
        {
          id: 'edge-a-b',
          fromNodeId: 'A',
          toNodeId: 'B',
          cost: 1,
        },
      ],
    };

    expect(algorithm.find(graph, 'B', 'A')).toBeNull();
  });

  it('returns a zero-cost path when origin equals destination', () => {
    const graph: DirectedGraph = {
      nodes: [{ id: 'A' }],
      edges: [],
    };

    expect(algorithm.find(graph, 'A', 'A')).toEqual({
      nodeIds: ['A'],
      edgeIds: [],
      totalCost: 0,
    });
  });

  it('returns null when the destination is unreachable', () => {
    const graph: DirectedGraph = {
      nodes: [{ id: 'A' }, { id: 'B' }, { id: 'E' }],
      edges: [
        {
          id: 'edge-a-b',
          fromNodeId: 'A',
          toNodeId: 'B',
          cost: 1,
        },
      ],
    };

    expect(algorithm.find(graph, 'A', 'E')).toBeNull();
  });

  it('chooses deterministically between equal-cost paths', () => {
    const graph: DirectedGraph = {
      nodes: [{ id: 'D' }, { id: 'C' }, { id: 'B' }, { id: 'A' }],
      edges: [
        {
          id: 'edge-c-d',
          fromNodeId: 'C',
          toNodeId: 'D',
          cost: 1,
        },
        {
          id: 'edge-a-c',
          fromNodeId: 'A',
          toNodeId: 'C',
          cost: 1,
        },
        {
          id: 'edge-b-d',
          fromNodeId: 'B',
          toNodeId: 'D',
          cost: 1,
        },
        {
          id: 'edge-a-b',
          fromNodeId: 'A',
          toNodeId: 'B',
          cost: 1,
        },
      ],
    };

    expect(algorithm.find(graph, 'A', 'D')).toEqual({
      nodeIds: ['A', 'B', 'D'],
      edgeIds: ['edge-a-b', 'edge-b-d'],
      totalCost: 2,
    });
  });

  it('chooses deterministically between parallel edges', () => {
    const graph: DirectedGraph = {
      nodes: [{ id: 'A' }, { id: 'B' }],
      edges: [
        {
          id: 'edge-z',
          fromNodeId: 'A',
          toNodeId: 'B',
          cost: 1,
        },
        {
          id: 'edge-a',
          fromNodeId: 'A',
          toNodeId: 'B',
          cost: 1,
        },
      ],
    };

    expect(algorithm.find(graph, 'A', 'B')).toEqual({
      nodeIds: ['A', 'B'],
      edgeIds: ['edge-a'],
      totalCost: 1,
    });
  });

  it('handles a zero-cost cycle', () => {
    const graph: DirectedGraph = {
      nodes: [{ id: 'A' }, { id: 'B' }, { id: 'C' }],
      edges: [
        {
          id: 'edge-a-b',
          fromNodeId: 'A',
          toNodeId: 'B',
          cost: 0,
        },
        {
          id: 'edge-b-a',
          fromNodeId: 'B',
          toNodeId: 'A',
          cost: 0,
        },
        {
          id: 'edge-b-c',
          fromNodeId: 'B',
          toNodeId: 'C',
          cost: 1,
        },
      ],
    };

    expect(algorithm.find(graph, 'A', 'C')).toEqual({
      nodeIds: ['A', 'B', 'C'],
      edgeIds: ['edge-a-b', 'edge-b-c'],
      totalCost: 1,
    });
  });

  it.each([
    {
      description: 'negative',
      cost: -1,
    },
    {
      description: 'infinite',
      cost: Number.POSITIVE_INFINITY,
    },
    {
      description: 'NaN',
      cost: Number.NaN,
    },
  ])('rejects a $description edge cost', ({ cost }) => {
    const graph: DirectedGraph = {
      nodes: [{ id: 'A' }, { id: 'B' }],
      edges: [
        {
          id: 'invalid-edge',
          fromNodeId: 'A',
          toNodeId: 'B',
          cost,
        },
      ],
    };

    expect(() => algorithm.find(graph, 'A', 'B')).toThrow('INVALID_EDGE_COST');
  });

  it('rejects an unknown origin', () => {
    const graph: DirectedGraph = {
      nodes: [{ id: 'A' }],
      edges: [],
    };

    expect(() => algorithm.find(graph, 'UNKNOWN', 'A')).toThrow(
      'ORIGIN_NODE_NOT_FOUND',
    );
  });

  it('rejects an edge connected to an unknown node', () => {
    const graph: DirectedGraph = {
      nodes: [{ id: 'A' }, { id: 'B' }],
      edges: [
        {
          id: 'edge-a-x',
          fromNodeId: 'A',
          toNodeId: 'X',
          cost: 1,
        },
      ],
    };

    expect(() => algorithm.find(graph, 'A', 'B')).toThrow(
      'EDGE_NODE_NOT_FOUND',
    );
  });
});
