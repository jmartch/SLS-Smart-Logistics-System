import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import {
  ResolveRouteRoadWaypointsRequest,
  ResolveRouteRoadWaypointsResult,
  RouteRoadWaypointRepository,
} from '../domain/route-road-waypoint.repository';

interface DepotNodeRow {
  readonly nodeId: string;
}

interface StopNodeRow {
  readonly geocodingCandidateId: string;
  readonly nodeId: string | null;
}

@Injectable()
export class PrismaRouteRoadWaypointRepository extends RouteRoadWaypointRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  resolveRouteWaypoints(
    request: ResolveRouteRoadWaypointsRequest,
  ): Promise<ResolveRouteRoadWaypointsResult> {
    return this.prisma.$transaction(
      async (transaction) => {
        await transaction.$executeRaw`SELECT set_config('app.tenant_id', ${request.tenantId}, true)`;

        const route = await transaction.route.findUnique({
          where: {
            tenantId_id: {
              tenantId: request.tenantId,
              id: request.routeId,
            },
          },
          select: {
            depotId: true,
            planningRequest: { select: { datasetId: true } },
            stops: {
              orderBy: { sequence: 'asc' },
              select: {
                id: true,
                geocodingAttempt: {
                  select: { selectedCandidateId: true },
                },
              },
            },
          },
        });

        if (route === null) {
          return { kind: 'ROUTE_NOT_FOUND' };
        }

        const datasetId = route.planningRequest.datasetId;
        if (datasetId === null) {
          return { kind: 'ROUTE_DATASET_REQUIRED' };
        }
        if (route.depotId === null) {
          return { kind: 'DEPOT_NOT_CONFIGURED' };
        }
        if (route.stops.length === 0) {
          return { kind: 'ROUTE_STOPS_REQUIRED' };
        }

        const selectedCandidates = route.stops.map((stop) => ({
          routeStopId: stop.id,
          candidateId: stop.geocodingAttempt?.selectedCandidateId ?? null,
        }));
        const missingCandidate = selectedCandidates.find(
          (stop) => stop.candidateId === null,
        );
        if (missingCandidate !== undefined) {
          return {
            kind: 'STOP_ATTACHMENT_NOT_READY',
            routeStopId: missingCandidate.routeStopId,
          };
        }

        const candidateIds = selectedCandidates.map(
          (stop) => stop.candidateId as string,
        );
        const [depotNodes, stopNodes] = await Promise.all([
          transaction.$queryRaw<DepotNodeRow[]>`
            SELECT node.id AS "nodeId"
            FROM "Depot" AS depot
            CROSS JOIN "RoadNode" AS node
            WHERE depot."tenantId" = ${request.tenantId}::uuid
              AND depot.id = ${route.depotId}::uuid
              AND node."datasetId" = ${datasetId}::uuid
              AND EXISTS (
                SELECT 1
                FROM "RoadEdge" AS edge
                WHERE edge."datasetId" = node."datasetId"
                  AND edge.profile = ${request.profile}::"RoadProfile"
                  AND (edge."fromNodeId" = node.id OR edge."toNodeId" = node.id)
              )
            ORDER BY node.location <-> depot.location, node.id
            LIMIT 1
          `,
          transaction.$queryRaw<StopNodeRow[]>`
            SELECT
              attachment."geocodingCandidateId",
              COALESCE(
                attachment."roadNodeId",
                CASE
                  WHEN ST_Distance(
                    attachment."snappedLocation"::geography,
                    source.location::geography
                  ) <= ST_Distance(
                    attachment."snappedLocation"::geography,
                    destination.location::geography
                  ) THEN edge."fromNodeId"
                  ELSE edge."toNodeId"
                END
              ) AS "nodeId"
            FROM "NetworkAttachment" AS attachment
            LEFT JOIN "RoadEdge" AS edge
              ON edge."datasetId" = attachment."datasetId"
              AND edge.id = attachment."roadEdgeId"
            LEFT JOIN "RoadNode" AS source
              ON source."datasetId" = edge."datasetId"
              AND source.id = edge."fromNodeId"
            LEFT JOIN "RoadNode" AS destination
              ON destination."datasetId" = edge."datasetId"
              AND destination.id = edge."toNodeId"
            WHERE attachment."tenantId" = ${request.tenantId}::uuid
              AND attachment."datasetId" = ${datasetId}::uuid
              AND attachment.profile = ${request.profile}::"RoadProfile"
              AND attachment.status IN ('AUTO_ACCEPTED', 'APPROVED')
              AND attachment."geocodingCandidateId" IN (${Prisma.join(
                candidateIds.map(
                  (candidateId) => Prisma.sql`${candidateId}::uuid`,
                ),
              )})
          `,
        ]);

        const depotNode = depotNodes[0];
        if (depotNode === undefined) {
          return { kind: 'DEPOT_ATTACHMENT_NOT_READY' };
        }

        const nodeByCandidate = new Map(
          stopNodes.map((row) => [row.geocodingCandidateId, row.nodeId]),
        );
        const orderedStopNodeIds: string[] = [];

        for (const stop of selectedCandidates) {
          const nodeId = nodeByCandidate.get(stop.candidateId as string);
          if (nodeId === undefined || nodeId === null) {
            return {
              kind: 'STOP_ATTACHMENT_NOT_READY',
              routeStopId: stop.routeStopId,
            };
          }
          orderedStopNodeIds.push(nodeId);
        }

        return {
          kind: 'RESOLVED',
          datasetId,
          depotNodeId: depotNode.nodeId,
          orderedStopNodeIds,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
