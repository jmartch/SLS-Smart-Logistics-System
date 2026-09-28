import { BuildRouteRoadPathService } from '../application/build-route-road-path.service';
import { FindRoadPathService } from '../application/find-road-path.service';
import { RouteRoadPathRepository } from '../domain/route-road-path.repository';

describe('BuildRouteRoadPathService', () => {
  const command = {
    tenantId: 'tenant-a',
    routeId: 'route-1',
    datasetId: 'dataset-1',
    profile: 'MOTOR_VEHICLE' as const,
    costMetric: 'DISTANCE' as const,
    depotNodeId: 'DEPOT',
    orderedStopNodeIds: ['STOP-1', 'STOP-2'],
  };

  function createService() {
    const findMany = jest.fn();
    const replaceRouteRoadPath = jest.fn();
    const pathFinder = { findMany } as unknown as FindRoadPathService;
    const repository = {
      replaceRouteRoadPath,
    } as unknown as RouteRoadPathRepository;

    return {
      findMany,
      replaceRouteRoadPath,
      service: new BuildRouteRoadPathService(pathFinder, repository),
    };
  }

  it('calculates departure, intermediate legs and depot return before persisting', async () => {
    const { findMany, replaceRouteRoadPath, service } = createService();
    findMany.mockResolvedValue({
      kind: 'FOUND',
      datasetId: 'dataset-1',
      datasetChecksum: 'checksum-1',
      legs: [
        {
          sequence: 1,
          originNodeId: 'DEPOT',
          destinationNodeId: 'STOP-1',
          path: { nodeIds: [], edgeIds: ['edge-1'], totalCost: 10 },
          geometries: [],
        },
        {
          sequence: 2,
          originNodeId: 'STOP-1',
          destinationNodeId: 'STOP-2',
          path: { nodeIds: [], edgeIds: ['edge-2'], totalCost: 20 },
          geometries: [],
        },
        {
          sequence: 3,
          originNodeId: 'STOP-2',
          destinationNodeId: 'DEPOT',
          path: { nodeIds: [], edgeIds: ['edge-3'], totalCost: 30 },
          geometries: [],
        },
      ],
    });
    replaceRouteRoadPath.mockResolvedValue({
      kind: 'PERSISTED',
      legCount: 3,
      totalDistanceM: 60,
      totalDurationS: 12,
    });

    await expect(service.execute(command)).resolves.toEqual({
      kind: 'PERSISTED',
      legCount: 3,
      totalDistanceM: 60,
      totalDurationS: 12,
      datasetChecksum: 'checksum-1',
    });

    expect(findMany).toHaveBeenCalledWith({
      datasetId: 'dataset-1',
      profile: 'MOTOR_VEHICLE',
      costMetric: 'DISTANCE',
      legs: [
        {
          sequence: 1,
          originNodeId: 'DEPOT',
          destinationNodeId: 'STOP-1',
        },
        {
          sequence: 2,
          originNodeId: 'STOP-1',
          destinationNodeId: 'STOP-2',
        },
        {
          sequence: 3,
          originNodeId: 'STOP-2',
          destinationNodeId: 'DEPOT',
        },
      ],
    });
    expect(replaceRouteRoadPath).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      routeId: 'route-1',
      datasetId: 'dataset-1',
      profile: 'MOTOR_VEHICLE',
      legs: [
        {
          sequence: 1,
          fromNodeId: 'DEPOT',
          toNodeId: 'STOP-1',
          edgeIds: ['edge-1'],
        },
        {
          sequence: 2,
          fromNodeId: 'STOP-1',
          toNodeId: 'STOP-2',
          edgeIds: ['edge-2'],
        },
        {
          sequence: 3,
          fromNodeId: 'STOP-2',
          toNodeId: 'DEPOT',
          edgeIds: ['edge-3'],
        },
      ],
    });
  });

  it('does not persist a partial route when one leg has no path', async () => {
    const { findMany, replaceRouteRoadPath, service } = createService();
    findMany.mockResolvedValue({
      kind: 'PATH_NOT_FOUND',
      sequence: 2,
      originNodeId: 'STOP-1',
      destinationNodeId: 'STOP-2',
    });

    await expect(service.execute(command)).resolves.toEqual({
      kind: 'PATH_NOT_FOUND',
      sequence: 2,
      originNodeId: 'STOP-1',
      destinationNodeId: 'STOP-2',
    });
    expect(replaceRouteRoadPath).not.toHaveBeenCalled();
  });

  it('returns persistence failures without exposing an unrelated checksum', async () => {
    const { findMany, replaceRouteRoadPath, service } = createService();
    findMany.mockResolvedValue({
      kind: 'FOUND',
      datasetId: 'dataset-1',
      datasetChecksum: 'checksum-1',
      legs: [
        {
          sequence: 1,
          originNodeId: 'DEPOT',
          destinationNodeId: 'STOP-1',
          path: { nodeIds: [], edgeIds: [], totalCost: 0 },
          geometries: [],
        },
      ],
    });
    replaceRouteRoadPath.mockResolvedValue({ kind: 'ROUTE_NOT_PLANNABLE' });

    await expect(service.execute(command)).resolves.toEqual({
      kind: 'ROUTE_NOT_PLANNABLE',
    });
  });

  it.each([
    {
      changes: { depotNodeId: ' ' },
      reason: 'DEPOT_NODE_REQUIRED',
    },
    {
      changes: { orderedStopNodeIds: [] },
      reason: 'ROUTE_STOPS_REQUIRED',
    },
    {
      changes: { orderedStopNodeIds: ['STOP-1', ''] },
      reason: 'STOP_NODE_REQUIRED',
    },
  ])('rejects an invalid route plan: $reason', async ({ changes, reason }) => {
    const { findMany, replaceRouteRoadPath, service } = createService();

    await expect(service.execute({ ...command, ...changes })).resolves.toEqual({
      kind: 'INVALID_ROUTE_PLAN',
      reason,
    });
    expect(findMany).not.toHaveBeenCalled();
    expect(replaceRouteRoadPath).not.toHaveBeenCalled();
  });
});
