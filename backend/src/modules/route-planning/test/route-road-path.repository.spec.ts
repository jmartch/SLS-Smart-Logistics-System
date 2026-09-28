import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { ReplaceRouteRoadPathRequest } from '../domain/route-road-path.repository';
import { PrismaRouteRoadPathRepository } from '../infrastructure/route-road-path.repository';

describe('PrismaRouteRoadPathRepository', () => {
  const request: ReplaceRouteRoadPathRequest = {
    tenantId: '10000000-0000-0000-0000-000000000001',
    routeId: '20000000-0000-0000-0000-000000000001',
    datasetId: '30000000-0000-0000-0000-000000000001',
    profile: 'MOTOR_VEHICLE',
    legs: [
      {
        sequence: 1,
        fromNodeId: 'node-a',
        toNodeId: 'node-b',
        edgeIds: ['edge-a-b'],
      },
      {
        sequence: 2,
        fromNodeId: 'node-b',
        toNodeId: 'node-c',
        edgeIds: ['edge-b-c'],
      },
      {
        sequence: 3,
        fromNodeId: 'node-c',
        toNodeId: 'node-a',
        edgeIds: ['edge-c-a'],
      },
    ],
  };

  function createFixture() {
    const transaction = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn().mockResolvedValue([{ id: request.routeId }]),
      route: {
        findUnique: jest.fn().mockResolvedValue({
          state: 'PLANNED',
          planningRequest: { datasetId: request.datasetId },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      geoDataset: {
        findFirst: jest.fn().mockResolvedValue({ id: request.datasetId }),
      },
      roadEdge: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'edge-a-b',
            fromNodeId: 'node-a',
            toNodeId: 'node-b',
            distanceM: new Prisma.Decimal('10.125'),
            durationS: new Prisma.Decimal('2.2'),
          },
          {
            id: 'edge-b-c',
            fromNodeId: 'node-b',
            toNodeId: 'node-c',
            distanceM: new Prisma.Decimal('15.250'),
            durationS: new Prisma.Decimal('3.1'),
          },
          {
            id: 'edge-c-a',
            fromNodeId: 'node-c',
            toNodeId: 'node-a',
            distanceM: new Prisma.Decimal('20.375'),
            durationS: new Prisma.Decimal('4.4'),
          },
        ]),
      },
      routeLeg: {
        findMany: jest.fn().mockResolvedValue([{ id: 'old-leg' }]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({ id: "new-leg" }),
      },
      routeLegEdge: {
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
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
      repository: new PrismaRouteRoadPathRepository(prisma),
    };
  }

  it('replaces all legs atomically and updates route totals', async () => {
    const { transaction, repository } = createFixture();

    await expect(repository.replaceRouteRoadPath(request)).resolves.toEqual({
      kind: 'PERSISTED',
      legCount: 3,
      totalDistanceM: 45.75,
      totalDurationS: 9.7,
    });

    expect(transaction.routeLegEdge.deleteMany).toHaveBeenCalledWith({
      where: {
        tenantId: request.tenantId,
        routeLegId: { in: ['old-leg'] },
      },
    });
    expect(transaction.routeLeg.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: request.tenantId, routeId: request.routeId },
    });
    expect(transaction.routeLeg.create).toHaveBeenCalledTimes(3);
    expect(transaction.routeLeg.create).toHaveBeenNthCalledWith(1, {
      data: {
        tenantId: request.tenantId,
        routeId: request.routeId,
        datasetId: request.datasetId,
        sequence: 1,
        profile: request.profile,
        fromNodeId: 'node-a',
        toNodeId: 'node-b',
        distanceM: new Prisma.Decimal('10.125'),
        durationS: new Prisma.Decimal('2.2'),
      },
      select: {
        id: true,
      },
    });
    expect(transaction.routeLegEdge.createMany).toHaveBeenNthCalledWith(1, {
      data: [
        {
          tenantId: request.tenantId,
          routeLegId: 'new-leg',
          datasetId: request.datasetId,
          roadEdgeId: 'edge-a-b',
          sequence: 1,
        },
      ],
    });
    expect(transaction.route.update).toHaveBeenCalledWith({
      where: {
        tenantId_id: { tenantId: request.tenantId, id: request.routeId },
      },
      data: {
        plannedDistanceM: new Prisma.Decimal('45.750'),
        plannedDurationS: 10,
      },
    });
  });

  it('does not reveal a route belonging to another tenant', async () => {
    const { transaction, repository } = createFixture();
    transaction.$queryRaw.mockResolvedValue([]);

    await expect(repository.replaceRouteRoadPath(request)).resolves.toEqual({
      kind: 'ROUTE_NOT_FOUND',
    });
    expect(transaction.roadEdge.findMany).not.toHaveBeenCalled();
    expect(transaction.routeLeg.deleteMany).not.toHaveBeenCalled();
  });

  it('rejects a route tied to another dataset before changing legs', async () => {
    const { transaction, repository } = createFixture();
    transaction.route.findUnique.mockResolvedValue({
      state: 'PLANNED',
      planningRequest: { datasetId: 'another-dataset' },
    });

    await expect(repository.replaceRouteRoadPath(request)).resolves.toEqual({
      kind: 'ROUTE_DATASET_MISMATCH',
    });
    expect(transaction.roadEdge.findMany).not.toHaveBeenCalled();
    expect(transaction.routeLeg.deleteMany).not.toHaveBeenCalled();
  });

  it.each(['IN_PROGRESS', 'COMPLETED', 'CANCELLED'])(
    'does not rewrite a %s route',
    async (state) => {
      const { transaction, repository } = createFixture();
      transaction.route.findUnique.mockResolvedValue({
        state,
        planningRequest: { datasetId: request.datasetId },
      });

      await expect(repository.replaceRouteRoadPath(request)).resolves.toEqual({
        kind: 'ROUTE_NOT_PLANNABLE',
      });
      expect(transaction.roadEdge.findMany).not.toHaveBeenCalled();
      expect(transaction.routeLeg.deleteMany).not.toHaveBeenCalled();
    },
  );

  it('validates every edge before deleting the previous route path', async () => {
    const { transaction, repository } = createFixture();
    transaction.roadEdge.findMany.mockResolvedValue([]);

    await expect(repository.replaceRouteRoadPath(request)).rejects.toThrow(
      'ROUTE_PATH_EDGE_NOT_FOUND: edge-a-b',
    );
    expect(transaction.routeLeg.findMany).not.toHaveBeenCalled();
    expect(transaction.routeLegEdge.deleteMany).not.toHaveBeenCalled();
    expect(transaction.routeLeg.deleteMany).not.toHaveBeenCalled();
  });

  it('rejects a non-contiguous or open route before starting a transaction', async () => {
    const { repository } = createFixture();

    await expect(
      repository.replaceRouteRoadPath({
        ...request,
        legs: [request.legs[0], { ...request.legs[2], sequence: 2 }],
      }),
    ).rejects.toThrow('ROUTE_LEGS_NOT_CONTIGUOUS');

    await expect(
      repository.replaceRouteRoadPath({
        ...request,
        legs: request.legs.slice(0, 2),
      }),
    ).rejects.toThrow('ROUTE_PATH_NOT_ROUND_TRIP');
  });
});
