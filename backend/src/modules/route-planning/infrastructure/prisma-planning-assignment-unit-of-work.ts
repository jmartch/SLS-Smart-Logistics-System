import { Injectable } from '@nestjs/common';
import {
  AssignmentStatus,
  AssignmentType,
  PackageState,
  PlanningPackageOutcome,
  Prisma,
  RoadProfile,
  RoutePlanningRequestStatus,
  RouteState,
  RouteStopState,
  OutboxEventStatus,
} from '../../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import type { PackageStateName } from '../../packages/domain/package-state.types';
import type {
  CreateAssignmentData,
  CreateOutboxEventData,
  CreatePlannedRouteData,
  CreatePlanningResultData,
  CreateRouteStopData,
  PlanningAssignmentSession,
  PlanningAssignmentUnitOfWork,
  PlanningBatchSnapshot,
  PlanningCourierSnapshot,
  PlanningDepotSnapshot,
  PlanningPackageSnapshot,
  PlanningVehicleSnapshot,
  UpdatePackageStateData,
} from '../application/ports/planning-assignment-unit-of-work';
import type {
  PlanAndAssignRoutesCommand,
  PlanAndAssignRoutesResult,
  PlannedRouteResult,
  PackagePlanningOutcome as DomainOutcome,
  PendingAssignmentReason,
  PlanningExecutionContext,
} from '../application/ports/plan-and-assign-routes.contract';

function isCommandEqual(a: unknown, b: PlanAndAssignRoutesCommand): boolean {
  if (!a || typeof a !== 'object') {
    return false;
  }
  const stored = a as Record<string, unknown>;
  if (stored.requestId !== b.requestId) return false;
  if (stored.zoneId !== b.zoneId) return false;
  if (stored.depotId !== b.depotId) return false;
  if (stored.datasetId !== b.datasetId) return false;
  if (stored.profile !== b.profile) return false;
  if (
    (stored.resourceSelection ?? 'MANUAL') !== (b.resourceSelection ?? 'MANUAL')
  )
    return false;
  if (Number(stored.radiusMeters) !== b.radiusMeters) return false;
  if (stored.ordering !== b.ordering) return false;

  const storedWindow = stored.window as
    { startAt?: string; endAt?: string } | undefined;
  if (
    !storedWindow ||
    storedWindow.startAt !== b.window.startAt ||
    storedWindow.endAt !== b.window.endAt
  ) {
    return false;
  }

  const arrayEq = (arr1: unknown, arr2: readonly string[]) => {
    if (!Array.isArray(arr1)) return false;
    if (arr1.length !== arr2.length) return false;
    const s1 = [...arr1].sort();
    const s2 = [...arr2].sort();
    return s1.every((val, idx) => val === s2[idx]);
  };

  if (!arrayEq(stored.packageIds, b.packageIds)) return false;
  if (!arrayEq(stored.vehicleIds, b.vehicleIds)) return false;
  if (!arrayEq(stored.courierIds, b.courierIds)) return false;

  if (stored.twoOpt || b.twoOpt) {
    const storedTwoOpt = stored.twoOpt as
      { maxIterations?: number; minImprovementMeters?: number } | undefined;
    if (
      storedTwoOpt?.maxIterations !== b.twoOpt?.maxIterations ||
      storedTwoOpt?.minImprovementMeters !== b.twoOpt?.minImprovementMeters
    ) {
      return false;
    }
  }

  return true;
}

export class PrismaPlanningAssignmentSession implements PlanningAssignmentSession {
  constructor(
    private readonly tx: Prisma.TransactionClient,
    private readonly context: PlanningExecutionContext,
  ) {}

  async claimRequest(
    requestId: string,
    command: PlanAndAssignRoutesCommand,
  ): Promise<
    | { readonly status: 'NEW' }
    | {
        readonly status: 'COMPLETED';
        readonly existingResult: PlanAndAssignRoutesResult;
      }
    | { readonly status: 'CONFLICT' }
  > {
    const existing = await this.tx.$queryRaw<
      Array<{
        id: string;
        tenantId: string;
        status: RoutePlanningRequestStatus;
        parameters: unknown;
        resultSnapshot: unknown;
      }>
    >`
            SELECT id, "tenantId", status, parameters, "resultSnapshot"
            FROM "RoutePlanningRequest"
            WHERE id = ${requestId}::uuid
            FOR UPDATE
        `;

    if (existing.length > 0) {
      const row = existing[0];
      if (row.tenantId !== this.context.tenantId) {
        return { status: 'CONFLICT' };
      }

      if (row.status === RoutePlanningRequestStatus.COMPLETED) {
        if (!isCommandEqual(row.parameters, command)) {
          return { status: 'CONFLICT' };
        }

        if (row.resultSnapshot && typeof row.resultSnapshot === 'object') {
          const snapshot = row.resultSnapshot as PlanAndAssignRoutesResult;
          return {
            status: 'COMPLETED',
            existingResult: {
              ...snapshot,
              replayed: true,
            },
          };
        }

        const routes = await this.tx.route.findMany({
          where: {
            tenantId: this.context.tenantId,
            planningRequestId: requestId,
          },
          include: {
            stops: {
              orderBy: { sequence: 'asc' },
            },
            assignments: {
              where: { status: AssignmentStatus.ACTIVE },
            },
          },
        });

        const packageResults = await this.tx.planningPackageResult.findMany({
          where: {
            tenantId: this.context.tenantId,
            planningRequestId: requestId,
          },
        });

        const allAssignments = routes.flatMap((r) => r.assignments);
        const assignmentMap = new Map(
          allAssignments.map((a) => [a.packageId, a]),
        );

        const plannedRoutes: PlannedRouteResult[] = routes.map((r) => {
          const stopPackageMap = new Map(
            r.assignments.map((a) => [a.routeStopId, a.packageId]),
          );
          return {
            routeId: r.id,
            vehicleId: r.vehicleId,
            courierId: r.courierId,
            state: 'PLANNED',
            stops: r.stops.map((s) => ({
              routeStopId: s.id,
              packageId: stopPackageMap.get(s.id) ?? '',
              sequence: s.sequence,
            })),
            totalDistanceMeters: r.plannedDistanceM
              ? r.plannedDistanceM.toNumber()
              : 0,
          };
        });

        const outcomes: DomainOutcome[] = packageResults.map((pr) => {
          if (pr.outcome === PlanningPackageOutcome.ASSIGNED) {
            const assignment = assignmentMap.get(pr.packageId);
            return {
              kind: 'ASSIGNED',
              packageId: pr.packageId,
              routeId: assignment?.routeId ?? '',
              routeStopId: assignment?.routeStopId ?? '',
              assignmentId: assignment?.id ?? '',
            };
          }
          const evidence = pr.evidence as Record<string, unknown> | null;
          return {
            kind: 'PENDING_ASSIGNMENT',
            packageId: pr.packageId,
            reasonCode:
              (pr.reasonCode as PendingAssignmentReason) ?? 'NO_CAPACITY',
            source:
              (evidence?.source as 'PREVALIDATION' | 'CLUSTER' | 'CHAIN') ??
              'CHAIN',
            sourceCode:
              (evidence?.sourceCode as string) ??
              pr.reasonCode ??
              'NO_CAPACITY',
            rejectedBy: (evidence?.rejectedBy as string) ?? null,
          };
        });

        return {
          status: 'COMPLETED',
          existingResult: {
            requestId,
            tenantId: this.context.tenantId,
            status: 'COMPLETED',
            replayed: true,
            routes: plannedRoutes,
            outcomes,
          },
        };
      }

      return { status: 'CONFLICT' };
    }

    await this.tx.routePlanningRequest.create({
      data: {
        id: requestId,
        tenantId: this.context.tenantId,
        requestedByUserId: this.context.actorUserId,
        status: RoutePlanningRequestStatus.IN_PROGRESS,
        parameters: command as unknown as Prisma.InputJsonValue,
        horizonStartAt: new Date(command.window.startAt),
        horizonEndAt: new Date(command.window.endAt),
        algorithm: command.ordering,
        algorithmVersion: '1',
        datasetId: command.datasetId,
      },
    });

    return { status: 'NEW' };
  }

  async loadSnapshot(
    command: PlanAndAssignRoutesCommand,
  ): Promise<PlanningBatchSnapshot> {
    const automatic = command.resourceSelection === 'AUTOMATIC';
    const dbVehicles = await this.tx.vehicle.findMany({
      where: {
        tenantId: this.context.tenantId,
        status: 'ACTIVE',
        ...(automatic ? {} : { id: { in: [...command.vehicleIds] } }),
      },
      orderBy: { id: 'asc' },
    });
    const dbCouriers = await this.tx.courier.findMany({
      where: {
        tenantId: this.context.tenantId,
        status: 'ACTIVE',
        user: { status: 'ACTIVE' },
        ...(automatic ? {} : { id: { in: [...command.courierIds] } }),
      },
      orderBy: { id: 'asc' },
    });
    const vehicleIds = dbVehicles.map((v) => v.id);
    const courierIds = dbCouriers.map((c) => c.id);

    if (command.packageIds.length > 0) {
      await this.tx.$queryRaw`
                SELECT id FROM "Package"
                WHERE "tenantId" = ${this.context.tenantId}::uuid
                  AND id IN (${Prisma.join(command.packageIds.map((id) => Prisma.sql`${id}::uuid`))})
                ORDER BY id FOR UPDATE
            `;
    }

    if (vehicleIds.length > 0) {
      await this.tx.$queryRaw`
                SELECT id FROM "Vehicle"
                WHERE "tenantId" = ${this.context.tenantId}::uuid
                  AND id IN (${Prisma.join(vehicleIds.map((id) => Prisma.sql`${id}::uuid`))})
                ORDER BY id FOR UPDATE
            `;
    }

    if (courierIds.length > 0) {
      await this.tx.$queryRaw`
                SELECT id FROM "Courier"
                WHERE "tenantId" = ${this.context.tenantId}::uuid
                  AND id IN (${Prisma.join(courierIds.map((id) => Prisma.sql`${id}::uuid`))})
                ORDER BY id FOR UPDATE
            `;
    }

    const dbPackages = await this.tx.package.findMany({
      where: {
        tenantId: this.context.tenantId,
        id: { in: [...command.packageIds] },
      },
      include: {
        geocodingAttempt: {
          include: {
            dataset: true,
          },
        },
      },
    });

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
        coordMap.set(c.id, { latitude: c.latitude, longitude: c.longitude });
      }
    }

    const attachmentMap = new Map<
      string,
      {
        status: 'AUTO_ACCEPTED' | 'REVIEW_REQUIRED' | 'APPROVED' | 'REJECTED';
        roadNodeId: string | null;
        roadEdgeId: string | null;
      }
    >();
    if (candidateIds.length > 0) {
      const attachments = await this.tx.networkAttachment.findMany({
        where: {
          tenantId: this.context.tenantId,
          geocodingCandidateId: { in: candidateIds },
          profile: command.profile as RoadProfile,
        },
        select: {
          geocodingCandidateId: true,
          status: true,
          roadNodeId: true,
          roadEdgeId: true,
        },
      });
      for (const a of attachments) {
        attachmentMap.set(a.geocodingCandidateId, {
          status: a.status as
            'AUTO_ACCEPTED' | 'REVIEW_REQUIRED' | 'APPROVED' | 'REJECTED',
          roadNodeId: a.roadNodeId,
          roadEdgeId: a.roadEdgeId,
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
        state: p.state as PackageStateName,
        zoneId: p.zoneId,
        addressId: p.addressId,
        weightGrams: Math.round(p.weightKg.toNumber() * 1000),
        volumeCm3: Math.round(p.volumeM3.toNumber() * 1000000),
        geocodingCandidate:
          attempt && candidateId && coords
            ? {
                candidateId,
                latitude: coords.latitude,
                longitude: coords.longitude,
                datasetId: attempt.datasetId,
                datasetStatus: attempt.dataset.status as
                  'STAGING' | 'READY' | 'FAILED',
                status: attempt.status as
                  'MATCHED' | 'REVIEW_REQUIRED' | 'NOT_FOUND',
              }
            : null,
        networkAttachment: attachment,
      };
    });

    const plannedStart = new Date(command.window.startAt);
    const plannedEnd = new Date(command.window.endAt);

    const vehicleActiveMap = new Map<
      string,
      { weightGrams: number; volumeCm3: number }
    >();
    if (vehicleIds.length > 0) {
      const activeSums = await this.tx.$queryRaw<
        Array<{ vehicleId: string; totalWeight: string; totalVolume: string }>
      >`
                SELECT a."vehicleId",
                       COALESCE(SUM(p."weightKg"), 0)::text AS "totalWeight",
                       COALESCE(SUM(p."volumeM3"), 0)::text AS "totalVolume"
                FROM "Assignment" a
                JOIN "Package" p ON p.id = a."packageId" AND p."tenantId" = a."tenantId"
                WHERE a."tenantId" = ${this.context.tenantId}::uuid
                  AND a.status = 'ACTIVE'
                  AND a."vehicleId" IN (${Prisma.join(vehicleIds.map((id) => Prisma.sql`${id}::uuid`))})
                GROUP BY a."vehicleId"
            `;
      for (const s of activeSums) {
        vehicleActiveMap.set(s.vehicleId, {
          weightGrams: Math.round(Number(s.totalWeight) * 1000),
          volumeCm3: Math.round(Number(s.totalVolume) * 1000000),
        });
      }
    }

    const vehicleOccupiedSet = new Set<string>();
    if (vehicleIds.length > 0) {
      const vehicleRoutes = await this.tx.route.findMany({
        where: {
          tenantId: this.context.tenantId,
          vehicleId: { in: [...vehicleIds] },
          OR: [
            {
              state: {
                in: [RouteState.IN_PROGRESS, RouteState.INTERRUPTED],
              },
            },
            {
              state: {
                in: [RouteState.PLANNED, RouteState.READY],
              },
              plannedStartAt: { lt: plannedEnd },
              plannedEndAt: { gt: plannedStart },
            },
          ],
        },
        select: { vehicleId: true },
      });
      for (const r of vehicleRoutes) {
        vehicleOccupiedSet.add(r.vehicleId);
      }
    }

    const vehicleSnapshots: PlanningVehicleSnapshot[] = dbVehicles.map((v) => {
      const active = vehicleActiveMap.get(v.id) ?? {
        weightGrams: 0,
        volumeCm3: 0,
      };
      return {
        id: v.id,
        tenantId: v.tenantId,
        maxWeightGrams: Math.round(v.maxWeightKg.toNumber() * 1000),
        maxVolumeCm3: Math.round(v.maxVolumeM3.toNumber() * 1000000),
        activeAssignedWeightGrams: active.weightGrams,
        activeAssignedVolumeCm3: active.volumeCm3,
        isActive: v.status === 'ACTIVE',
        isOccupiedInWindow: vehicleOccupiedSet.has(v.id),
      };
    });

    const courierOccupiedSet = new Set<string>();
    if (courierIds.length > 0) {
      const courierRoutes = await this.tx.route.findMany({
        where: {
          tenantId: this.context.tenantId,
          courierId: { in: [...courierIds] },
          OR: [
            {
              state: {
                in: [RouteState.IN_PROGRESS, RouteState.INTERRUPTED],
              },
            },
            {
              state: {
                in: [RouteState.PLANNED, RouteState.READY],
              },
              plannedStartAt: { lt: plannedEnd },
              plannedEndAt: { gt: plannedStart },
            },
          ],
        },
        select: { courierId: true },
      });
      for (const r of courierRoutes) {
        courierOccupiedSet.add(r.courierId);
      }
    }

    const courierSnapshots: PlanningCourierSnapshot[] = dbCouriers.map((c) => ({
      id: c.id,
      tenantId: c.tenantId,
      isActive: c.status === 'ACTIVE',
      isOccupiedInWindow: courierOccupiedSet.has(c.id),
    }));

    let depotSnapshot: PlanningDepotSnapshot | null = null;
    if (command.depotId) {
      const depotCoords = await this.tx.$queryRaw<
        Array<{ latitude: number; longitude: number }>
      >`
                SELECT ST_Y(location)::float8 AS latitude, ST_X(location)::float8 AS longitude
                FROM "Depot"
                WHERE "tenantId" = ${this.context.tenantId}::uuid
                  AND id = ${command.depotId}::uuid
            `;
      if (depotCoords.length > 0) {
        depotSnapshot = {
          id: command.depotId,
          tenantId: this.context.tenantId,
          latitude: depotCoords[0].latitude,
          longitude: depotCoords[0].longitude,
        };
      }
    }

    const activeAssignments = await this.tx.assignment.findMany({
      where: {
        tenantId: this.context.tenantId,
        packageId: { in: [...command.packageIds] },
        status: AssignmentStatus.ACTIVE,
      },
      select: { packageId: true },
    });
    const activeAssignmentPackageIds = new Set(
      activeAssignments.map((a) => a.packageId),
    );

    return {
      packages: packageSnapshots,
      vehicles: vehicleSnapshots,
      couriers: courierSnapshots,
      depot: depotSnapshot,
      activeAssignmentPackageIds,
    };
  }

  async createRoute(route: CreatePlannedRouteData): Promise<void> {
    await this.tx.route.create({
      data: {
        id: route.id,
        tenantId: this.context.tenantId,
        planningRequestId: route.planningRequestId,
        vehicleId: route.vehicleId,
        courierId: route.courierId,
        depotId: route.depotId,
        state: RouteState.PLANNED,
        plannedStartAt: new Date(route.plannedStartAt),
        plannedEndAt: new Date(route.plannedEndAt),
        plannedDistanceM: new Prisma.Decimal(route.plannedDistanceM.toFixed(2)),
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
          fromState: update.fromState as PackageState,
          toState: update.toState as PackageState,
          reasonCode: update.reasonCode ?? null,
          changedByUserId: update.changedByUserId,
        },
      });
    }
  }

  async savePlanningResults(
    results: readonly CreatePlanningResultData[],
  ): Promise<void> {
    if (results.length === 0) return;
    await this.tx.planningPackageResult.createMany({
      data: results.map((r) => ({
        tenantId: this.context.tenantId,
        planningRequestId: r.planningRequestId,
        packageId: r.packageId,
        outcome:
          r.outcome === 'ASSIGNED'
            ? PlanningPackageOutcome.ASSIGNED
            : PlanningPackageOutcome.PENDING,
        reasonCode: r.reasonCode ?? null,
        evidence: r.evidence as Prisma.InputJsonValue,
      })),
    });
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

  async completeRequest(
    requestId: string,
    result: PlanAndAssignRoutesResult,
  ): Promise<void> {
    await this.tx.routePlanningRequest.update({
      where: {
        tenantId_id: {
          tenantId: this.context.tenantId,
          id: requestId,
        },
      },
      data: {
        status: RoutePlanningRequestStatus.COMPLETED,
        completedAt: new Date(),
        resultSnapshot: result as unknown as Prisma.InputJsonValue,
      },
    });
  }
}

@Injectable()
export class PrismaPlanningAssignmentUnitOfWork implements PlanningAssignmentUnitOfWork {
  private static readonly MAX_ATTEMPTS = 3;

  constructor(private readonly prisma: PrismaService) {}

  async run<T>(
    context: PlanningExecutionContext,
    operation: (session: PlanningAssignmentSession) => Promise<T>,
  ): Promise<T> {
    for (
      let attempt = 0;
      attempt < PrismaPlanningAssignmentUnitOfWork.MAX_ATTEMPTS;
      attempt++
    ) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            await tx.$executeRaw`SELECT set_config('app.tenant_id', ${context.tenantId}, true)`;
            const session = new PrismaPlanningAssignmentSession(tx, context);
            return await operation(session);
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          },
        );
      } catch (error: unknown) {
        const lastAttempt =
          attempt === PrismaPlanningAssignmentUnitOfWork.MAX_ATTEMPTS - 1;
        if (lastAttempt || !this.isRetryableTransactionError(error)) {
          throw error;
        }
      }
    }

    throw new Error('PLANNING_ASSIGNMENT_RETRY_EXHAUSTED');
  }

  private isRetryableTransactionError(error: unknown): boolean {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2034'
    ) {
      return true;
    }

    const failure = error as {
      code?: unknown;
      meta?: {
        code?: unknown;
        driverAdapterError?: {
          cause?: { code?: unknown; originalCode?: unknown };
        };
      };
    } | null;
    // Raw locking queries can wrap PostgreSQL serialization/deadlock errors
    // as P2010 instead of the transaction-level P2034.
    const cause = failure?.meta?.driverAdapterError?.cause;
    return [
      failure?.code,
      failure?.meta?.code,
      cause?.code,
      cause?.originalCode,
    ].some((code) => code === '40001' || code === '40P01');
  }
}
