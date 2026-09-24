import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import {
  LoadRoadGraphRequest,
  RoadGraphRepository,
  RoadGraphSnapshot,
} from '../domain/road-graph-repository';

@Injectable()
export class PrismaRoadGraphRepository implements RoadGraphRepository {
  constructor(private readonly prisma: PrismaService) {}

  async loadReadyGraph(
    request: LoadRoadGraphRequest,
  ): Promise<RoadGraphSnapshot | null> {
    return this.prisma.$transaction(
      async (transaction) => {
        const dataset = await transaction.geoDataset.findFirst({
          where: { id: request.datasetId, status: 'READY' },
          select: { id: true, checksum: true },
        });

        if (dataset === null) {
          return null;
        }

        const [nodes, edges] = await Promise.all([
          transaction.roadNode.findMany({
            where: { datasetId: dataset.id },
            select: { id: true },
            orderBy: { id: 'asc' },
          }),

          transaction.roadEdge.findMany({
            where: { datasetId: dataset.id, profile: request.profile },
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
          }),
        ]);

        const graphEdges = edges.map((edge) => {
          const decimalCost =
            request.costMetric === 'DISTANCE' ? edge.distanceM : edge.durationS;

          const cost = decimalCost.toNumber();

          if (!Number.isFinite(cost) || cost < 0) {
            throw new Error('INVALID_ROAD_EDGE_COST');
          }

          return {
            id: edge.id,
            fromNodeId: edge.fromNodeId,
            toNodeId: edge.toNodeId,
            cost,
          };
        });

        return {
          datasetId: dataset.id,
          datasetChecksum: dataset.checksum,
          graph: {
            nodes: nodes.map((node) => ({
              id: node.id,
            })),
            edges: graphEdges,
          },
        };
      },
      {
        isolationLevel: 'RepeatableRead',
      },
    );
  }
}
