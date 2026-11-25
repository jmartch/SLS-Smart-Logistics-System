import { Injectable } from '@nestjs/common';
import {
  AssignmentStatus,
  AssignmentType,
  GeoDatasetStatus,
  OutboxEventStatus,
  Prisma,
  RoadProfile,
  RouteStopState,
} from '../../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import type { PlanningExecutionContext } from '../application/ports/plan-and-assign-routes.contract';
import type {
  CreateAssignmentData,
  CreateOutboxEventData,
  CreateRouteStopData,
  PlanningDepotSnapshot,
  PlanningPackageSnapshot,
  UpdatePackageStateData,
} from '../application/ports/planning-assignment-unit-of-work';
import {
  EditableRouteReplanUnitOfWork,
  type EditableRouteExistingStopSnapshot,
  type EditableRouteReplanSession,
  type EditableRouteSnapshot,
  type UpdateRouteStopSequenceData,
} from '../application/ports/replan-editable-route.contract';

export class PrismaEditableRouteReplanSession implements EditableRouteReplanSession {
  constructor(
    private readonly tx: Prisma.TransactionClient,
    private readonly context: PlanningExecutionContext,
  ) {}

  async loadEditableRouteSnapshot(
    routeId: string,
    packageIds: readonly string[],
  ): Promise<EditableRouteSnapshot | null> {
    await this.tx.$queryRaw`
            SELECT id FROM "Route"
            WHERE "tenantId" = ${this.context.tenantId}::uuid
              AND id = ${routeId}::uuid
            FOR UPDATE
        `;

    const route = await this.tx.route.findUnique({
      where: {
        tenantId_id: {
          tenantId: this.context.tenantId,
          id: routeId,
        },
      },
      include: {
        vehicle: true,
        courier: { include: { user: { select: { status: true } } } },
        planningRequest: {
          select: { datasetId: true },
        },
        stops: {
          orderBy: { sequence: 'asc' },
        },
        assignments: {
          where: { status: AssignmentStatus.ACTIVE },
        },
      },
    });

    if (!route) {
      return null;
    }

    if (packageIds.length > 0) {
      await this.tx.$queryRaw`
                SELECT id FROM "Package"
                WHERE "tenantId" = ${this.context.tenantId}::uuid
                  AND id IN (${Prisma.join(packageIds.map((id) => Prisma.sql`${id}::uuid`))})
                ORDER BY id FOR UPDATE
            `;
    }

    let datasetId = route.planningRequest?.datasetId ?? null;
    if (!datasetId) {
      const readyDataset = await this.tx.geoDataset.findFirst({
        where: { status: GeoDatasetStatus.READY },
        orderBy: [{ readyAt: 'desc' }, { createdAt: 'desc' }],
        select: { id: true },
      });
      datasetId = readyDataset?.id ?? '';
    }

    const dbPackages =
      packageIds.length > 0
        ? await this.tx.package.findMany({
            where: {
              tenantId: this.context.tenantId,
              id: { in: [...packageIds] },
            },
            include: {
              address: { select: { originalText: true } },
              geocodingAttempt: {
                include: {
                  dataset: true,
                },
              },
            },
          })
        : [];

    const candidateIds = dbPackages
      .map((p) => p.geocodingAttempt?.selectedCandidateId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

    const coordMap = new Map<string, { latitude: number; longitude: number }>();
    if (candidateIds.length > 0) {
      const candidateCoords = await this.tx.$queryRaw<
        Array<{ id: string; latitude: number; longitude: number }>
      >`
                SELECT id, ST_Y(location)::float8 AS latitude, ST_X(location)::float8 AS longitude
                FROM "GeocodingCandidate"
                WHERE "tenantId" = ${this.context.tenantId}::uuid
                  AND id IN (${Prisma.join(candidateIds.map((id) => Prisma.sql`${id}::uuid`))})
            `;
      for (const c of candidateCoords) {
        coordMap.set(c.id, {
          latitude: c.latitude,
          longitude: c.longitude,
        });
      }
    }

    const attachmentMap = new Map<
      string,
      {
        status: 'AUTO_ACCEPTED' | 'REVIEW_REQUIRED' | 'APPROVED' | 'REJECTED';
        roadNodeId: string | null;
        roadEdgeId: string | null;
        datasetId: string;
        profile: 'MOTOR_VEHICLE' | 'MOTORCYCLE' | 'BICYCLE' | 'FOOT';
        geocodingCandidateId: string;
      }
    >();
    if (candidateIds.length > 0) {
      const attachments = await this.tx.networkAttachment.findMany({
        where: {
          tenantId: this.context.tenantId,
          geocodingCandidateId: { in: candidateIds },
          datasetId: datasetId ? datasetId : undefined,
          profile: RoadProfile.MOTOR_VEHICLE,
        },
        select: {
          geocodingCandidateId: true,
          datasetId: true,
          profile: true,
          status: true,
          roadNodeId: true,
          roadEdgeId: true,
        },
      });
      for (const a of attachments) {
        attachmentMap.set(a.geocodingCandidateId, {
          status: a.status,
          roadNodeId: a.roadNodeId,
          roadEdgeId: a.roadEdgeId,
          datasetId: a.datasetId,
          profile: a.profile,
          geocodingCandidateId: a.geocodingCandidateId,
        });
      }
    }

    const packageSnapshots: PlanningPackageSnapshot[] = dbPackages.map((p) => {
      const attempt = p.geocodingAttempt;
      const candidateId = attempt?.selectedCandidateId ?? null;
      const coords = candidateId ? (coordMap.get(candidateId) ?? null) : null;
      const attachment = candidateId
        ? (attachmentMap.get(candidateId) ?? null)
        : null;

      return {
        id: p.id,
        tenantId: p.tenantId,
        state: p.state,
        zoneId: p.zoneId,
        addressId: p.addressId,
        weightGrams: Math.round(p.weightKg.toNumber() * 1000),
        volumeCm3: Math.round(p.volumeM3.toNumber() * 1000000),
        geocodingAttemptId: p.geocodingAttemptId,
        geocodingCandidate:
          attempt && candidateId && coords
            ? {
                candidateId,
                latitude: coords.latitude,
                longitude: coords.longitude,
                datasetId: attempt.datasetId,
                datasetStatus: attempt.dataset.status,
                status: attempt.status,
                attemptId: attempt.id,
              }
            : null,
        networkAttachment: attachment,
      };
    });

    const activeSums = await this.tx.$queryRaw<
      Array<{ totalWeight: string; totalVolume: string }>
    >`
            SELECT COALESCE(SUM(p."weightKg"), 0)::text AS "totalWeight",
                   COALESCE(SUM(p."volumeM3"), 0)::text AS "totalVolume"
            FROM "Assignment" a
            JOIN "Package" p ON p.id = a."packageId"
            WHERE a."tenantId" = ${this.context.tenantId}::uuid
              AND a.status = 'ACTIVE'
              AND a."vehicleId" = ${route.vehicleId}::uuid
        `;
    const activeWeightGrams = Math.round(
      Number(activeSums[0]?.totalWeight ?? '0') * 1000,
    );
    const activeVolumeCm3 = Math.round(
      Number(activeSums[0]?.totalVolume ?? '0') * 1000000,
    );

    let depotSnapshot: PlanningDepotSnapshot | null = null;
    const depotRows = route.depotId
      ? await this.tx.$queryRaw<
          Array<{ id: string; latitude: number; longitude: number }>
        >`
                  SELECT id, ST_Y(location)::float8 AS latitude, ST_X(location)::float8 AS longitude
                  FROM "Depot"
                  WHERE "tenantId" = ${this.context.tenantId}::uuid
                    AND id = ${route.depotId}::uuid
              `
      : await this.tx.$queryRaw<
          Array<{ id: string; latitude: number; longitude: number }>
        >`
                  SELECT id, ST_Y(location)::float8 AS latitude, ST_X(location)::float8 AS longitude
                  FROM "Depot"
                  WHERE "tenantId" = ${this.context.tenantId}::uuid
                  ORDER BY name ASC
                  LIMIT 1
              `;
    if (depotRows.length > 0) {
      depotSnapshot = {
        id: depotRows[0].id,
        tenantId: this.context.tenantId,
        latitude: depotRows[0].latitude,
        longitude: depotRows[0].longitude,
      };
    }

    const activeAssignments =
      packageIds.length > 0
        ? await this.tx.assignment.findMany({
            where: {
              tenantId: this.context.tenantId,
              packageId: { in: [...packageIds] },
              status: AssignmentStatus.ACTIVE,
            },
            select: { packageId: true },
          })
        : [];

    const packageByStopId = new Map(
      route.assignments.map((a) => [a.routeStopId, a.packageId]),
    );

    const existingStops: EditableRouteExistingStopSnapshot[] = route.stops
      .map((stop) => {
        const packageId = packageByStopId.get(stop.id);
        if (!packageId) return null;
        return {
          routeStopId: stop.id,
          packageId,
          sequence: stop.sequence,
          latitude: stop.latitude.toNumber(),
          longitude: stop.longitude.toNumber(),
        };
      })
      .filter(
        (stop): stop is EditableRouteExistingStopSnapshot => stop !== null,
      );

    return {
      id: route.id,
      tenantId: route.tenantId,
      state: route.state,
      vehicleId: route.vehicleId,
      courierId: route.courierId,
      datasetId,
      depot: depotSnapshot,
      existingStops,
      vehicle: {
        id: route.vehicle.id,
        tenantId: route.vehicle.tenantId,
        maxWeightGrams: Math.round(route.vehicle.maxWeightKg.toNumber() * 1000),
        maxVolumeCm3: Math.round(
          route.vehicle.maxVolumeM3.toNumber() * 1000000,
        ),
        activeAssignedWeightGrams: activeWeightGrams,
        activeAssignedVolumeCm3: activeVolumeCm3,
        isActive: route.vehicle.status === 'ACTIVE',
        isOccupiedInWindow: false,
      },
      courier: {
        id: route.courier.id,
        tenantId: route.courier.tenantId,
        isActive:
          route.courier.status === 'ACTIVE' &&
          route.courier.user.status === 'ACTIVE',
        isOccupiedInWindow: false,
      },
      packages: packageSnapshots,
      activeAssignmentPackageIds: new Set(
        activeAssignments.map((a) => a.packageId),
      ),
    };
  }

  async updateStopSequences(
    routeId: string,
    updates: readonly UpdateRouteStopSequenceData[],
    plannedDistanceM: number,
  ): Promise<void> {
    for (let idx = 0; idx < updates.length; idx++) {
      const update = updates[idx];
      await this.tx.routeStop.update({
        where: {
          tenantId_id: {
            tenantId: this.context.tenantId,
            id: update.routeStopId,
          },
        },
        data: {
          sequence: 10000 + idx,
        },
      });
    }

    for (const update of updates) {
      await this.tx.routeStop.update({
        where: {
          tenantId_id: {
            tenantId: this.context.tenantId,
            id: update.routeStopId,
          },
        },
        data: {
          sequence: update.sequence,
        },
      });
    }

    await this.tx.route.update({
      where: {
        tenantId_id: {
          tenantId: this.context.tenantId,
          id: routeId,
        },
      },
      data: {
        plannedDistanceM: new Prisma.Decimal(plannedDistanceM.toFixed(2)),
      },
    });
  }

  async createRouteStops(stops: readonly CreateRouteStopData[]): Promise<void> {
    if (stops.length === 0) return;
    await this.tx.routeStop.createMany({
      data: stops.map((s) => ({
        id: s.id,
        tenantId: this.context.tenantId,
        routeId: s.routeId,
        sequence: s.sequence,
        latitude: new Prisma.Decimal(s.latitude.toFixed(6)),
        longitude: new Prisma.Decimal(s.longitude.toFixed(6)),
        geocodingAttemptId: s.geocodingAttemptId ?? null,
        state: RouteStopState.PENDING,
      })),
    });
  }

  async createAssignments(
    assignments: readonly CreateAssignmentData[],
  ): Promise<void> {
    if (assignments.length === 0) return;
    await this.tx.assignment.createMany({
      data: assignments.map((a) => ({
        id: a.id,
        tenantId: this.context.tenantId,
        packageId: a.packageId,
        routeId: a.routeId,
        routeStopId: a.routeStopId,
        vehicleId: a.vehicleId,
        courierId: a.courierId,
        responsibleUserId: a.responsibleUserId,
        assignmentType: AssignmentType.INITIAL,
        status: AssignmentStatus.ACTIVE,
        reasonCode: a.reasonCode,
      })),
    });
  }

  async updatePackageStates(
    updates: readonly UpdatePackageStateData[],
  ): Promise<void> {
    for (const update of updates) {
      const updated = await this.tx.$executeRaw`
                UPDATE "Package"
                SET state = ${update.toState}::"PackageState"
                WHERE "tenantId" = ${this.context.tenantId}::uuid
                  AND id = ${update.packageId}::uuid
                  AND state = ${update.fromState}::"PackageState"
            `;

      if (updated === 0) {
        throw new Error(
          `CONCURRENT_PACKAGE_STATE_CONFLICT: Package ${update.packageId} is not in expected state ${update.fromState}`,
        );
      }

      await this.tx.packageStatusHistory.create({
        data: {
          tenantId: this.context.tenantId,
          packageId: update.packageId,
          fromState: update.fromState,
          toState: update.toState,
          reasonCode: update.reasonCode ?? null,
          changedByUserId: update.changedByUserId,
        },
      });
    }
  }

  async saveOutboxEvents(
    events: readonly CreateOutboxEventData[],
  ): Promise<void> {
    if (events.length === 0) return;
    await this.tx.outboxEvent.createMany({
      data: events.map((e) => ({
        tenantId: this.context.tenantId,
        eventId: e.eventId,
        correlationId: e.correlationId,
        eventType: e.eventType,
        version: e.version ?? 1,
        payload: e.payload as Prisma.InputJsonValue,
        status: OutboxEventStatus.PENDING,
        producer: e.producer ?? 'sls-backend.route-planning',
        occurredAt: e.occurredAt ?? new Date(),
      })),
    });
  }
}

@Injectable()
export class PrismaEditableRouteReplanUnitOfWork extends EditableRouteReplanUnitOfWork {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async run<T>(
    context: PlanningExecutionContext,
    operation: (session: EditableRouteReplanSession) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${context.tenantId}, true)`;
        const session = new PrismaEditableRouteReplanSession(tx, context);
        return operation(session);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }
}
