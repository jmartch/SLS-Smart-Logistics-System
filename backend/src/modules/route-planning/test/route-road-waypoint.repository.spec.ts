import { PrismaService } from '../../../database/prisma.service';
import { PrismaRouteRoadWaypointRepository } from '../infrastructure/route-road-waypoint.repository';

describe('PrismaRouteRoadWaypointRepository', () => {
  const request = {
    tenantId: '10000000-0000-0000-0000-000000000001',
    routeId: '20000000-0000-0000-0000-000000000001',
    profile: 'MOTOR_VEHICLE' as const,
  };
  const datasetId = '30000000-0000-0000-0000-000000000001';

  function createFixture() {
    const transaction = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ nodeId: 'depot-node' }])
        .mockResolvedValueOnce([
          {
            geocodingCandidateId: 'candidate-1',
            nodeId: 'stop-node-1',
          },
          {
            geocodingCandidateId: 'candidate-2',
            nodeId: 'stop-node-2',
          },
        ]),
      route: {
        findUnique: jest.fn().mockResolvedValue({
          depotId: '40000000-0000-0000-0000-000000000001',
          planningRequest: { datasetId },
          stops: [
            {
              id: 'stop-1',
              geocodingAttempt: { selectedCandidateId: 'candidate-1' },
            },
            {
              id: 'stop-2',
              geocodingAttempt: { selectedCandidateId: 'candidate-2' },
            },
          ],
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        async (callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService;

    return {
      transaction,
      repository: new PrismaRouteRoadWaypointRepository(prisma),
    };
  }

  it('resolves the depot and every stop in route sequence', async () => {
    const { transaction, repository } = createFixture();

    await expect(repository.resolveRouteWaypoints(request)).resolves.toEqual({
      kind: 'RESOLVED',
      datasetId,
      depotNodeId: 'depot-node',
      orderedStopNodeIds: ['stop-node-1', 'stop-node-2'],
    });
    expect(transaction.route.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_id: {
            tenantId: request.tenantId,
            id: request.routeId,
          },
        },
      }),
    );
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('uses the same not-found result for an inaccessible tenant route', async () => {
    const { transaction, repository } = createFixture();
    transaction.route.findUnique.mockResolvedValue(null);

    await expect(repository.resolveRouteWaypoints(request)).resolves.toEqual({
      kind: 'ROUTE_NOT_FOUND',
    });
    expect(transaction.$queryRaw).not.toHaveBeenCalled();
  });

  it('reports the first stop without a selected geocoding candidate', async () => {
    const { transaction, repository } = createFixture();
    transaction.route.findUnique.mockResolvedValue({
      depotId: '40000000-0000-0000-0000-000000000001',
      planningRequest: { datasetId },
      stops: [
        { id: 'stop-1', geocodingAttempt: null },
        {
          id: 'stop-2',
          geocodingAttempt: { selectedCandidateId: 'candidate-2' },
        },
      ],
    });

    await expect(repository.resolveRouteWaypoints(request)).resolves.toEqual({
      kind: 'STOP_ATTACHMENT_NOT_READY',
      routeStopId: 'stop-1',
    });
    expect(transaction.$queryRaw).not.toHaveBeenCalled();
  });

  it('does not calculate a route when an accepted attachment is absent', async () => {
    const { transaction, repository } = createFixture();
    transaction.$queryRaw
      .mockReset()
      .mockResolvedValueOnce([{ nodeId: 'depot-node' }])
      .mockResolvedValueOnce([
        {
          geocodingCandidateId: 'candidate-1',
          nodeId: 'stop-node-1',
        },
      ]);

    await expect(repository.resolveRouteWaypoints(request)).resolves.toEqual({
      kind: 'STOP_ATTACHMENT_NOT_READY',
      routeStopId: 'stop-2',
    });
  });

  it('requires a depot, stops and a planning dataset', async () => {
    const { transaction, repository } = createFixture();

    transaction.route.findUnique.mockResolvedValueOnce({
      depotId: null,
      planningRequest: { datasetId },
      stops: [{ id: 'stop-1', geocodingAttempt: null }],
    });
    await expect(repository.resolveRouteWaypoints(request)).resolves.toEqual({
      kind: 'DEPOT_NOT_CONFIGURED',
    });

    transaction.route.findUnique.mockResolvedValueOnce({
      depotId: '40000000-0000-0000-0000-000000000001',
      planningRequest: { datasetId },
      stops: [],
    });
    await expect(repository.resolveRouteWaypoints(request)).resolves.toEqual({
      kind: 'ROUTE_STOPS_REQUIRED',
    });

    transaction.route.findUnique.mockResolvedValueOnce({
      depotId: '40000000-0000-0000-0000-000000000001',
      planningRequest: { datasetId: null },
      stops: [],
    });
    await expect(repository.resolveRouteWaypoints(request)).resolves.toEqual({
      kind: 'ROUTE_DATASET_REQUIRED',
    });
  });
});
