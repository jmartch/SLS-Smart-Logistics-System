import { FindRoadPathService } from '../application/find-road-path.service';
import { RoadGraphRepository } from '../domain/road-graph-repository';
import { RoadPathGeometryRepository } from '../domain/road-path-geometry-repository';
import { ShortestPath } from '../domain/shortest-path';

describe('FindRoadPathService', () => {
  const request = {
    datasetId: 'dataset-1',
    profile: 'MOTOR_VEHICLE' as const,
    costMetric: 'DISTANCE' as const,
    originNodeId: 'A',
    destinationNodeId: 'D',
  };

  it('does not run Dijkstra when the dataset is not READY', async () => {
    const loadReadyGraph = jest.fn().mockResolvedValue(null);
    const find = jest.fn();
    const loadOrderedGeometries = jest.fn();

    const repository = { loadReadyGraph } as RoadGraphRepository;
    const shortestPath = { find } as ShortestPath;
    const orderedGeometries = {
      loadOrderedGeometries,
    } as RoadPathGeometryRepository;

    const service = new FindRoadPathService(
      repository,
      shortestPath,
      orderedGeometries,
    );

    await expect(service.find(request)).resolves.toEqual({
      kind: 'DATASET_NOT_READY',
    });

    expect(loadReadyGraph).toHaveBeenCalledWith({
      datasetId: 'dataset-1',
      profile: 'MOTOR_VEHICLE',
      costMetric: 'DISTANCE',
    });

    expect(find).not.toHaveBeenCalled();
    expect(loadOrderedGeometries).not.toHaveBeenCalled();
  });

  it('returns PATH_NOT_FOUND when Dijkstra finds no route', async () => {
    const snapshot = {
      datasetId: 'dataset-1',
      datasetChecksum: 'checksum-1',
      graph: {
        nodes: [{ id: 'A' }, { id: 'D' }],
        edges: [],
      },
    };

    const loadReadyGraph = jest.fn().mockResolvedValue(snapshot);
    const find = jest.fn().mockReturnValue(null);
    const loadOrderedGeometries = jest.fn();

    const service = new FindRoadPathService(
      { loadReadyGraph },
      { find },
      { loadOrderedGeometries },
    );

    await expect(service.find(request)).resolves.toEqual({
      kind: 'PATH_NOT_FOUND',
    });

    expect(find).toHaveBeenCalledWith(snapshot.graph, 'A', 'D');
    expect(loadOrderedGeometries).not.toHaveBeenCalled();
  });

  it('returns the path with the dataset version', async () => {
    const snapshot = {
      datasetId: 'dataset-1',
      datasetChecksum: 'checksum-1',
      graph: {
        nodes: [{ id: 'A' }, { id: 'D' }],
        edges: [
          {
            id: 'edge-a-d',
            fromNodeId: 'A',
            toNodeId: 'D',
            cost: 4,
          },
        ],
      },
    };

    const path = {
      nodeIds: ['A', 'D'],
      edgeIds: ['edge-a-d'],
      totalCost: 4,
    };

    const loadReadyGraph = jest.fn().mockResolvedValue(snapshot);
    const find = jest.fn().mockReturnValue(path);
    const geometries = [
      {
        edgeId: 'edge-a-d',
        coordinates: [
          [-74.8, 10.98],
          [-74.79, 10.99],
        ],
      },
    ];
    const loadOrderedGeometries = jest.fn().mockResolvedValue(geometries);

    const service = new FindRoadPathService(
      { loadReadyGraph },
      { find },
      { loadOrderedGeometries },
    );

    await expect(service.find(request)).resolves.toEqual({
      kind: 'FOUND',
      datasetId: 'dataset-1',
      datasetChecksum: 'checksum-1',
      geometries,
      path,
    });

    expect(find).toHaveBeenCalledWith(snapshot.graph, 'A', 'D');
    expect(loadOrderedGeometries).toHaveBeenCalledWith('dataset-1', [
      'edge-a-d',
    ]);
  });

  it('loads the graph once when calculating every route leg', async () => {
    const snapshot = {
      datasetId: 'dataset-1',
      datasetChecksum: 'checksum-1',
      graph: {
        nodes: [{ id: 'A' }, { id: 'B' }, { id: 'C' }],
        edges: [],
      },
    };
    const paths = [
      { nodeIds: ['A', 'B'], edgeIds: ['edge-a-b'], totalCost: 1 },
      { nodeIds: ['B', 'C'], edgeIds: ['edge-b-c'], totalCost: 2 },
    ];
    const loadReadyGraph = jest.fn().mockResolvedValue(snapshot);
    const find = jest
      .fn()
      .mockReturnValueOnce(paths[0])
      .mockReturnValueOnce(paths[1]);
    const loadOrderedGeometries = jest
      .fn()
      .mockResolvedValueOnce([{ edgeId: 'edge-a-b', coordinates: [] }])
      .mockResolvedValueOnce([{ edgeId: 'edge-b-c', coordinates: [] }]);
    const service = new FindRoadPathService(
      { loadReadyGraph },
      { find },
      { loadOrderedGeometries },
    );

    await expect(
      service.findMany({
        datasetId: 'dataset-1',
        profile: 'MOTOR_VEHICLE',
        costMetric: 'DURATION',
        legs: [
          { sequence: 1, originNodeId: 'A', destinationNodeId: 'B' },
          { sequence: 2, originNodeId: 'B', destinationNodeId: 'C' },
        ],
      }),
    ).resolves.toMatchObject({
      kind: 'FOUND',
      datasetId: 'dataset-1',
      datasetChecksum: 'checksum-1',
      legs: [
        { sequence: 1, path: paths[0] },
        { sequence: 2, path: paths[1] },
      ],
    });

    expect(loadReadyGraph).toHaveBeenCalledTimes(1);
    expect(find).toHaveBeenCalledTimes(2);
    expect(loadOrderedGeometries).toHaveBeenCalledTimes(2);
  });

  it('does not load geometries when one route leg has no path', async () => {
    const loadReadyGraph = jest.fn().mockResolvedValue({
      datasetId: 'dataset-1',
      datasetChecksum: 'checksum-1',
      graph: { nodes: [{ id: 'A' }, { id: 'B' }], edges: [] },
    });
    const find = jest
      .fn()
      .mockReturnValueOnce({
        nodeIds: ['A', 'B'],
        edgeIds: ['edge-a-b'],
        totalCost: 1,
      })
      .mockReturnValueOnce(null);
    const loadOrderedGeometries = jest.fn();
    const service = new FindRoadPathService(
      { loadReadyGraph },
      { find },
      { loadOrderedGeometries },
    );

    await expect(
      service.findMany({
        datasetId: 'dataset-1',
        profile: 'MOTOR_VEHICLE',
        costMetric: 'DISTANCE',
        legs: [
          { sequence: 1, originNodeId: 'A', destinationNodeId: 'B' },
          { sequence: 2, originNodeId: 'B', destinationNodeId: 'A' },
        ],
      }),
    ).resolves.toEqual({
      kind: 'PATH_NOT_FOUND',
      sequence: 2,
      originNodeId: 'B',
      destinationNodeId: 'A',
    });
    expect(loadOrderedGeometries).not.toHaveBeenCalled();
  });
});
