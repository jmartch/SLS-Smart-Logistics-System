import { PrismaService } from '../../../database/prisma.service';
import { RoadCostMetric } from '../domain/road-graph-repository';
import { PrismaRoadGraphRepository } from '../infrastructure/graph-repository';

describe('PrismaRoadGraphRepository', () => {
  const datasetId = '30000000-0000-0000-0000-000000000001';

  function createFixture() {
    const transaction = {
      geoDataset: { findFirst: jest.fn() },
      roadNode: { findMany: jest.fn() },
      roadEdge: { findMany: jest.fn() },
    };

    const prisma = {
      $transaction: jest.fn(
        async (callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService;

    return {
      transaction,
      repository: new PrismaRoadGraphRepository(prisma),
    };
  }

  it('returns null when there is no READY dataset', async () => {
    const { transaction, repository } = createFixture();

    transaction.geoDataset.findFirst.mockResolvedValue(null);

    const result = await repository.loadReadyGraph({
      datasetId,
      profile: 'MOTOR_VEHICLE',
      costMetric: 'DISTANCE',
    });

    expect(result).toBeNull();

    expect(transaction.geoDataset.findFirst).toHaveBeenCalledWith({
      where: {
        id: datasetId,
        status: 'READY',
      },
      select: {
        id: true,
        checksum: true,
      },
    });

    expect(transaction.roadNode.findMany).not.toHaveBeenCalled();
    expect(transaction.roadEdge.findMany).not.toHaveBeenCalled();
  });

  it('returns the graph and checksum of a READY dataset', async () => {
    const { transaction, repository } = createFixture();

    transaction.geoDataset.findFirst.mockResolvedValue({
      id: datasetId,
      checksum: 'abc123',
    });

    transaction.roadNode.findMany.mockResolvedValue([{ id: 'A' }, { id: 'B' }]);

    transaction.roadEdge.findMany.mockResolvedValue([
      {
        id: 'edge-a-b',
        fromNodeId: 'A',
        toNodeId: 'B',
        distanceM: { toNumber: () => 1500 },
        durationS: { toNumber: () => 180 },
      },
    ]);

    const result = await repository.loadReadyGraph({
      datasetId,
      profile: 'MOTOR_VEHICLE',
      costMetric: 'DISTANCE',
    });

    expect(result).toEqual({
      datasetId,
      datasetChecksum: 'abc123',
      graph: {
        nodes: [{ id: 'A' }, { id: 'B' }],
        edges: [
          {
            id: 'edge-a-b',
            fromNodeId: 'A',
            toNodeId: 'B',
            cost: 1500,
          },
        ],
      },
    });
  });

  it('requests only edges of the selected profile', async () => {
    const { transaction, repository } = createFixture();

    transaction.geoDataset.findFirst.mockResolvedValue({
      id: datasetId,
      checksum: 'abc123',
    });
    transaction.roadNode.findMany.mockResolvedValue([]);
    transaction.roadEdge.findMany.mockResolvedValue([]);

    await repository.loadReadyGraph({
      datasetId,
      profile: 'BICYCLE',
      costMetric: 'DISTANCE',
    });

    expect(transaction.roadEdge.findMany).toHaveBeenCalledWith({
      where: {
        datasetId,
        profile: 'BICYCLE',
      },
      select: {
        id: true,
        fromNodeId: true,
        toNodeId: true,
        distanceM: true,
        durationS: true,
      },
      orderBy: {
        id: 'asc',
      },
    });
  });

  it.each<{ metric: RoadCostMetric; expectedCost: number }>([
    { metric: 'DISTANCE', expectedCost: 1500 },
    { metric: 'DURATION', expectedCost: 180 },
  ])('uses $metric as the edge cost', async ({ metric, expectedCost }) => {
    const { transaction, repository } = createFixture();

    transaction.geoDataset.findFirst.mockResolvedValue({
      id: datasetId,
      checksum: 'abc123',
    });

    transaction.roadNode.findMany.mockResolvedValue([{ id: 'A' }, { id: 'B' }]);

    transaction.roadEdge.findMany.mockResolvedValue([
      {
        id: 'edge-a-b',
        fromNodeId: 'A',
        toNodeId: 'B',
        distanceM: { toNumber: () => 1500 },
        durationS: { toNumber: () => 180 },
      },
    ]);

    const result = await repository.loadReadyGraph({
      datasetId,
      profile: 'MOTOR_VEHICLE',
      costMetric: metric,
    });

    expect(result?.graph.edges[0].cost).toBe(expectedCost);
  });

  it('preserves isolated nodes', async () => {
    const { transaction, repository } = createFixture();

    transaction.geoDataset.findFirst.mockResolvedValue({
      id: datasetId,
      checksum: 'abc123',
    });

    transaction.roadNode.findMany.mockResolvedValue([
      { id: 'A' },
      { id: 'B' },
      { id: 'E' },
    ]);

    transaction.roadEdge.findMany.mockResolvedValue([
      {
        id: 'edge-a-b',
        fromNodeId: 'A',
        toNodeId: 'B',
        distanceM: { toNumber: () => 1 },
        durationS: { toNumber: () => 2 },
      },
    ]);

    const result = await repository.loadReadyGraph({
      datasetId,
      profile: 'MOTOR_VEHICLE',
      costMetric: 'DISTANCE',
    });

    expect(result?.graph.nodes).toContainEqual({ id: 'E' });
    expect(result?.graph.edges).toHaveLength(1);
  });

  it.each([
    { description: 'negative', cost: -1 },
    { description: 'infinite', cost: Number.POSITIVE_INFINITY },
    { description: 'NaN', cost: Number.NaN },
  ])('rejects a $description edge cost', async ({ cost }) => {
    const { transaction, repository } = createFixture();

    transaction.geoDataset.findFirst.mockResolvedValue({
      id: datasetId,
      checksum: 'abc123',
    });

    transaction.roadNode.findMany.mockResolvedValue([{ id: 'A' }, { id: 'B' }]);

    transaction.roadEdge.findMany.mockResolvedValue([
      {
        id: 'invalid-edge',
        fromNodeId: 'A',
        toNodeId: 'B',
        distanceM: { toNumber: () => cost },
        durationS: { toNumber: () => 10 },
      },
    ]);

    await expect(
      repository.loadReadyGraph({
        datasetId,
        profile: 'MOTOR_VEHICLE',
        costMetric: 'DISTANCE',
      }),
    ).rejects.toThrow('INVALID_ROAD_EDGE_COST');
  });
});
