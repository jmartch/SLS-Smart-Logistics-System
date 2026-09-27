import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import {
  ReplaceRouteRoadPathRequest,
  ReplaceRouteRoadPathResult,
  RouteRoadPathRepository,
} from '../domain/route-road-path.repository';

@Injectable()
export class PrismaRouteRoadPathRepository extends RouteRoadPathRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async replaceRouteRoadPath(
    request: ReplaceRouteRoadPathRequest,
  ): Promise<ReplaceRouteRoadPathResult> {
    this.validatePlanStructure(request);

    return this.prisma.$transaction(
      async (transaction) => {
        await transaction.$executeRaw`SELECT set_config('app.tenant_id', ${request.tenantId}, true)`;

        const lockedRoutes = await transaction.$queryRaw<Array<{ id: string }>>`
          SELECT id
          FROM "Route"
          WHERE "tenantId" = ${request.tenantId}::uuid
            AND id = ${request.routeId}::uuid
          FOR UPDATE
        `;

        if (lockedRoutes.length === 0) {
          return { kind: 'ROUTE_NOT_FOUND' };
        }

        const [route, dataset] = await Promise.all([
          transaction.route.findUnique({
            where: {
              tenantId_id: {
                tenantId: request.tenantId,
                id: request.routeId,
              },
            },
            select: {
              state: true,
              planningRequest: { select: { datasetId: true } },
            },
          }),
          transaction.geoDataset.findFirst({
            where: { id: request.datasetId, status: 'READY' },
            select: { id: true },
          }),
        ]);

        if (route === null) {
          return { kind: 'ROUTE_NOT_FOUND' };
        }

        if (route.state !== 'PLANNED') {
          return { kind: 'ROUTE_NOT_PLANNABLE' };
        }

        if (route.planningRequest.datasetId !== request.datasetId) {
          return { kind: 'ROUTE_DATASET_MISMATCH' };
        }

        if (dataset === null) {
          return { kind: 'DATASET_NOT_READY' };
        }

        const edgeIds = [
          ...new Set(request.legs.flatMap((leg) => leg.edgeIds)),
        ];
        const edges = await transaction.roadEdge.findMany({
          where: {
            datasetId: request.datasetId,
            profile: request.profile,
            id: { in: edgeIds },
          },
          select: {
            id: true,
            fromNodeId: true,
            toNodeId: true,
            distanceM: true,
            durationS: true,
          },
        });
        const edgeById = new Map(edges.map((edge) => [edge.id, edge]));
        const legMetrics = request.legs.map((leg) => {
          let currentNodeId = leg.fromNodeId;
          let distanceM = new Prisma.Decimal(0);
          let durationS = new Prisma.Decimal(0);

          for (const edgeId of leg.edgeIds) {
            const edge = edgeById.get(edgeId);
            if (edge === undefined) {
              throw new Error(`ROUTE_PATH_EDGE_NOT_FOUND: ${edgeId}`);
            }
            if (edge.fromNodeId !== currentNodeId) {
              throw new Error(`ROUTE_PATH_DISCONTINUOUS: ${edgeId}`);
            }

            currentNodeId = edge.toNodeId;
            distanceM = distanceM.add(edge.distanceM);
            durationS = durationS.add(edge.durationS);
          }

          if (currentNodeId !== leg.toNodeId) {
            throw new Error(`ROUTE_PATH_DESTINATION_MISMATCH: ${leg.sequence}`);
          }

          return { leg, distanceM, durationS };
        });

        const existingLegs = await transaction.routeLeg.findMany({
          where: { tenantId: request.tenantId, routeId: request.routeId },
          select: { id: true },
        });
        const existingLegIds = existingLegs.map((leg) => leg.id);

        if (existingLegIds.length > 0) {
          await transaction.routeLegEdge.deleteMany({
            where: {
              tenantId: request.tenantId,
              routeLegId: { in: existingLegIds },
            },
          });
          await transaction.routeLeg.deleteMany({
            where: { tenantId: request.tenantId, routeId: request.routeId },
          });
        }

        for (const metrics of legMetrics) {
          const routeLeg = await transaction.routeLeg.create({
            data: {
              tenantId: request.tenantId,
              routeId: request.routeId,
              datasetId: request.datasetId,
              sequence: metrics.leg.sequence,
              profile: request.profile,
              fromNodeId: metrics.leg.fromNodeId,
              toNodeId: metrics.leg.toNodeId,
              distanceM: metrics.distanceM,
              durationS: metrics.durationS,
            },
            select: {
              id: true,
            },
          });

          if (metrics.leg.edgeIds.length > 0) {
            await transaction.routeLegEdge.createMany({
              data: metrics.leg.edgeIds.map((roadEdgeId, index) => ({
                tenantId: request.tenantId,
                routeLegId: routeLeg.id,
                datasetId: request.datasetId,
                roadEdgeId,
                sequence: index + 1,
              })),
            });
          }
        }

        const totalDistance = legMetrics.reduce(
          (total, metrics) => total.add(metrics.distanceM),
          new Prisma.Decimal(0),
        );
        const totalDuration = legMetrics.reduce(
          (total, metrics) => total.add(metrics.durationS),
          new Prisma.Decimal(0),
        );

        await transaction.route.update({
          where: {
            tenantId_id: {
              tenantId: request.tenantId,
              id: request.routeId,
            },
          },
          data: {
            plannedDistanceM: totalDistance,
            plannedDurationS: Math.ceil(totalDuration.toNumber()),
          },
        });

        return {
          kind: 'PERSISTED',
          legCount: legMetrics.length,
          totalDistanceM: totalDistance.toNumber(),
          totalDurationS: totalDuration.toNumber(),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private validatePlanStructure(request: ReplaceRouteRoadPathRequest): void {
    if (request.legs.length === 0) {
      throw new Error('ROUTE_PATH_LEGS_REQUIRED');
    }

    request.legs.forEach((leg, index) => {
      if (leg.sequence !== index + 1) {
        throw new Error('INVALID_ROUTE_LEG_SEQUENCE');
      }
      if (
        leg.fromNodeId.trim().length === 0 ||
        leg.toNodeId.trim().length === 0
      ) {
        throw new Error('ROUTE_PATH_NODE_REQUIRED');
      }
      if (index > 0 && request.legs[index - 1].toNodeId !== leg.fromNodeId) {
        throw new Error('ROUTE_LEGS_NOT_CONTIGUOUS');
      }
    });

    if (request.legs[0].fromNodeId !== request.legs.at(-1)?.toNodeId) {
      throw new Error('ROUTE_PATH_NOT_ROUND_TRIP');
    }
  }
}
