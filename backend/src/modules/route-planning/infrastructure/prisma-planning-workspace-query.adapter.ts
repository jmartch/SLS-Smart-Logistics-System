import { Injectable } from '@nestjs/common';
import {
  AssignmentStatus,
  CourierStatus,
  GeoDatasetStatus,
  PackageState,
  Prisma,
  RouteState,
  UserStatus,
  VehicleStatus,
} from '../../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { runWithTenant } from '../../../database/run-with-tenant';
import {
  PlanningWorkspaceQueryPort,
  type PlanningWorkspaceCourier,
  type PlanningWorkspaceDataset,
  type PlanningWorkspaceDepot,
  type PlanningWorkspaceEditableRoute,
  type PlanningWorkspacePackage,
  type PlanningWorkspaceQuery,
  type PlanningWorkspaceSnapshot,
  type PlanningWorkspaceVehicle,
} from '../application/ports/planning-workspace-query.port';

@Injectable()
export class PrismaPlanningWorkspaceQueryAdapter extends PlanningWorkspaceQueryPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async getWorkspace(
    query: PlanningWorkspaceQuery,
  ): Promise<PlanningWorkspaceSnapshot> {
    const { tenantId, zoneId, window } = query;
    const plannedStart = window ? new Date(window.startAt) : null;
    const plannedEnd = window ? new Date(window.endAt) : null;

    return runWithTenant(this.prisma, tenantId, async (tx) => {
      const zones = await tx.zone.findMany({
        where: { tenantId },
        orderBy: { code: 'asc' },
        select: {
          id: true,
          code: true,
          name: true,
        },
      });

      const depots = await tx.$queryRaw<PlanningWorkspaceDepot[]>`
                SELECT id,
                       name,
                       "timeZone",
                       ST_Y(location)::float8 AS latitude,
                       ST_X(location)::float8 AS longitude
                FROM "Depot"
                WHERE "tenantId" = ${tenantId}::uuid
                ORDER BY name ASC
            `;

      const dbDatasets = await tx.geoDataset.findMany({
        where: { status: GeoDatasetStatus.READY },
        orderBy: [{ readyAt: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          name: true,
          sourceType: true,
          coverage: true,
          readyAt: true,
        },
      });

      const datasets: PlanningWorkspaceDataset[] = dbDatasets.map((d) => ({
        id: d.id,
        name: d.name,
        sourceType: d.sourceType,
        coverage: d.coverage,
        readyAt: d.readyAt ? d.readyAt.toISOString() : null,
      }));

      const dbVehicles = await tx.vehicle.findMany({
        where: {
          tenantId,
          status: VehicleStatus.ACTIVE,
        },
        orderBy: { plate: 'asc' },
      });

      const vehicleIds = dbVehicles.map((v) => v.id);
      const vehicleActiveMap = new Map<
        string,
        { weightKg: number; volumeM3: number }
      >();

      if (vehicleIds.length > 0) {
        const activeSums = await tx.$queryRaw<
          Array<{
            vehicleId: string;
            totalWeight: string;
            totalVolume: string;
          }>
        >`
                    SELECT a."vehicleId",
                           COALESCE(SUM(p."weightKg"), 0)::text AS "totalWeight",
                           COALESCE(SUM(p."volumeM3"), 0)::text AS "totalVolume"
                    FROM "Assignment" a
                    JOIN "Package" p ON p.id = a."packageId" AND p."tenantId" = a."tenantId"
                    WHERE a."tenantId" = ${tenantId}::uuid
                      AND a.status = 'ACTIVE'
                      AND a."vehicleId" IN (${Prisma.join(vehicleIds.map((id) => Prisma.sql`${id}::uuid`))})
                    GROUP BY a."vehicleId"
                `;
        for (const row of activeSums) {
          vehicleActiveMap.set(row.vehicleId, {
            weightKg: Number(row.totalWeight),
            volumeM3: Number(row.totalVolume),
          });
        }
      }

      const vehicleOccupiedSet = new Set<string>();
      if (vehicleIds.length > 0) {
        const occupiedConditions: Prisma.RouteWhereInput[] = [
          {
            state: {
              in: [RouteState.IN_PROGRESS, RouteState.INTERRUPTED],
            },
          },
        ];
        if (plannedStart && plannedEnd) {
          occupiedConditions.push({
            state: {
              in: [RouteState.PLANNED, RouteState.READY],
            },
            plannedStartAt: { lt: plannedEnd },
            plannedEndAt: { gt: plannedStart },
          });
        }
        const occupiedRoutes = await tx.route.findMany({
          where: {
            tenantId,
            vehicleId: { in: vehicleIds },
            OR: occupiedConditions,
          },
          select: { vehicleId: true },
        });
        for (const r of occupiedRoutes) {
          vehicleOccupiedSet.add(r.vehicleId);
        }
      }

      const vehicles: PlanningWorkspaceVehicle[] = dbVehicles.map((v) => {
        const maxWeight = v.maxWeightKg.toNumber();
        const maxVolume = v.maxVolumeM3.toNumber();
        const active = vehicleActiveMap.get(v.id) ?? {
          weightKg: 0,
          volumeM3: 0,
        };
        const remainingWeight = Math.max(0, maxWeight - active.weightKg);
        const remainingVolume = Math.max(0, maxVolume - active.volumeM3);
        const isActive = v.status === VehicleStatus.ACTIVE;
        const isOccupiedInWindow = vehicleOccupiedSet.has(v.id);
        const isEligible =
          Boolean(window) &&
          isActive &&
          !isOccupiedInWindow &&
          remainingWeight > 0 &&
          remainingVolume > 0;

        return {
          id: v.id,
          plate: v.plate,
          status: 'ACTIVE',
          maxWeightKg: maxWeight.toFixed(3),
          maxVolumeM3: maxVolume.toFixed(6),
          activeAssignedWeightKg: active.weightKg.toFixed(3),
          activeAssignedVolumeM3: active.volumeM3.toFixed(6),
          remainingWeightKg: remainingWeight.toFixed(3),
          remainingVolumeM3: remainingVolume.toFixed(6),
          isActive,
          isOccupiedInWindow,
          isEligible,
        };
      });

      const dbCouriers = await tx.courier.findMany({
        where: {
          tenantId,
          status: CourierStatus.ACTIVE,
          user: { status: UserStatus.ACTIVE },
        },
        include: {
          user: { select: { email: true } },
        },
        orderBy: { id: 'asc' },
      });

      const courierIds = dbCouriers.map((c) => c.id);
      const courierOccupiedSet = new Set<string>();
      if (courierIds.length > 0) {
        const occupiedConditions: Prisma.RouteWhereInput[] = [
          {
            state: {
              in: [RouteState.IN_PROGRESS, RouteState.INTERRUPTED],
            },
          },
        ];
        if (plannedStart && plannedEnd) {
          occupiedConditions.push({
            state: {
              in: [RouteState.PLANNED, RouteState.READY],
            },
            plannedStartAt: { lt: plannedEnd },
            plannedEndAt: { gt: plannedStart },
          });
        }
        const occupiedRoutes = await tx.route.findMany({
          where: {
            tenantId,
            courierId: { in: courierIds },
            OR: occupiedConditions,
          },
          select: { courierId: true },
        });
        for (const r of occupiedRoutes) {
          courierOccupiedSet.add(r.courierId);
        }
      }

      const couriers: PlanningWorkspaceCourier[] = dbCouriers.map((c) => {
        const isActive = c.status === CourierStatus.ACTIVE;
        const isOccupiedInWindow = courierOccupiedSet.has(c.id);
        const isEligible = Boolean(window) && isActive && !isOccupiedInWindow;

        return {
          id: c.id,
          userId: c.userId,
          email: c.user.email,
          status: 'ACTIVE',
          isActive,
          isOccupiedInWindow,
          isEligible,
        };
      });

      const dbCandidatePackages = await tx.package.findMany({
        where: {
          tenantId,
          state: {
            in: [PackageState.CLASSIFIED, PackageState.PENDING_ASSIGNMENT],
          },
          ...(zoneId ? { zoneId } : {}),
          assignments: {
            none: { status: AssignmentStatus.ACTIVE },
          },
        },
        orderBy: { trackingCode: 'asc' },
        include: {
          address: { select: { originalText: true, municipalityCode: true } },
          zone: { select: { name: true } },
          sector: { select: { name: true } },
          geocodingAttempt: {
            select: {
              status: true,
              datasetId: true,
              selectedCandidateId: true,
              dataset: { select: { id: true, status: true } },
              selectedCandidate: {
                select: {
                  id: true,
                  networkAttachments: {
                    select: {
                      id: true,
                      datasetId: true,
                      profile: true,
                      status: true,
                      accessDistanceM: true,
                      roadNodeId: true,
                      roadEdgeId: true,
                    },
                  },
                },
              },
            },
          },
          statusHistory: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              reasonCode: true,
              createdAt: true,
            },
          },
          planningResults: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              reasonCode: true,
              createdAt: true,
            },
          },
        },
      });

      const candidatePackages: PlanningWorkspacePackage[] =
        dbCandidatePackages.map((pkg) => {
          const latestHistory = pkg.statusHistory?.[0];
          const latestPlanningResult = pkg.planningResults?.[0];
          const lastPendingReasonCode =
            pkg.state === 'PENDING_ASSIGNMENT'
              ? (latestPlanningResult?.reasonCode ??
                latestHistory?.reasonCode ??
                'NO_CAPACITY')
              : null;
          const lastStateChangedAt =
            latestHistory?.createdAt?.toISOString() ??
            latestPlanningResult?.createdAt?.toISOString() ??
            null;

          const hasReadyCoordinates = Boolean(
            pkg.geocodingAttempt?.selectedCandidateId &&
            pkg.geocodingAttempt.status === 'MATCHED' &&
            pkg.geocodingAttempt.dataset.status === 'READY',
          );

          const candidate = pkg.geocodingAttempt?.selectedCandidate;
          const rawAttachments = candidate?.networkAttachments ?? [];
          const mappedAttachments = rawAttachments.map((a) => ({
            id: a.id,
            datasetId: a.datasetId,
            profile: a.profile,
            status: a.status,
            accessDistanceMeters: Number(a.accessDistanceM),
          }));

          const rawGeocoding = pkg.geocodingAttempt
            ? {
                attemptStatus: pkg.geocodingAttempt.status,
                attemptDatasetId: pkg.geocodingAttempt.datasetId,
                isDatasetReady: pkg.geocodingAttempt.dataset.status === 'READY',
                selectedCandidateId: pkg.geocodingAttempt.selectedCandidateId,
                networkAttachments: mappedAttachments,
              }
            : null;

          return {
            id: pkg.id,
            trackingCode: pkg.trackingCode,
            state: pkg.state as 'CLASSIFIED' | 'PENDING_ASSIGNMENT',
            priority: pkg.priority,
            zoneId: pkg.zoneId,
            zoneName: pkg.zone?.name ?? null,
            sectorId: pkg.sectorId,
            sectorName: pkg.sector?.name ?? null,
            address: pkg.address.originalText,
            municipalityCode: pkg.address.municipalityCode,
            weightKg: String(pkg.weightKg),
            volumeM3: String(pkg.volumeM3),
            hasReadyCoordinates,
            rawGeocoding,
            lastPendingReasonCode,
            lastStateChangedAt,
          };
        });

      const dbPlannedRoutes = await tx.route.findMany({
        where: {
          tenantId,
          state: RouteState.PLANNED,
          ...(plannedStart && plannedEnd
            ? {
                OR: [
                  { plannedStartAt: null },
                  { plannedEndAt: null },
                  {
                    plannedStartAt: { lt: plannedEnd },
                    plannedEndAt: { gt: plannedStart },
                  },
                ],
              }
            : {}),
        },
        orderBy: { plannedAt: 'desc' },
        include: {
          vehicle: {
            select: {
              id: true,
              plate: true,
              maxWeightKg: true,
              maxVolumeM3: true,
            },
          },
          courier: {
            include: {
              user: { select: { email: true } },
            },
          },
          _count: {
            select: { stops: true },
          },
          assignments: {
            where: { status: AssignmentStatus.ACTIVE },
            include: {
              package: {
                select: {
                  weightKg: true,
                  volumeM3: true,
                },
              },
            },
          },
        },
      });

      const editableRoutes: PlanningWorkspaceEditableRoute[] =
        dbPlannedRoutes.map((route) => {
          const maxWeight = route.vehicle.maxWeightKg.toNumber();
          const maxVolume = route.vehicle.maxVolumeM3.toNumber();
          const routeWeight = route.assignments.reduce(
            (sum, a) => sum + a.package.weightKg.toNumber(),
            0,
          );
          const routeVolume = route.assignments.reduce(
            (sum, a) => sum + a.package.volumeM3.toNumber(),
            0,
          );
          const vehicleActive = vehicleActiveMap.get(route.vehicleId) ?? {
            weightKg: routeWeight,
            volumeM3: routeVolume,
          };
          const remainingWeight = Math.max(
            0,
            maxWeight - vehicleActive.weightKg,
          );
          const remainingVolume = Math.max(
            0,
            maxVolume - vehicleActive.volumeM3,
          );

          return {
            id: route.id,
            state: 'PLANNED',
            vehicleId: route.vehicleId,
            vehiclePlate: route.vehicle.plate,
            courierId: route.courierId,
            courierEmail: route.courier.user.email,
            depotId: route.depotId,
            plannedStartAt: route.plannedStartAt
              ? route.plannedStartAt.toISOString()
              : null,
            plannedEndAt: route.plannedEndAt
              ? route.plannedEndAt.toISOString()
              : null,
            stopCount: route._count.stops,
            assignedPackageCount: route.assignments.length,
            assignedWeightKg: routeWeight.toFixed(3),
            assignedVolumeM3: routeVolume.toFixed(6),
            remainingWeightKg: remainingWeight.toFixed(3),
            remainingVolumeM3: remainingVolume.toFixed(6),
          };
        });

      return {
        tenantId,
        window: window ?? null,
        zones,
        depots,
        datasets,
        vehicles,
        couriers,
        candidatePackages,
        editableRoutes,
      };
    });
  }
}
