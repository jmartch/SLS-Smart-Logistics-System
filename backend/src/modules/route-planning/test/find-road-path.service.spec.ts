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
});
