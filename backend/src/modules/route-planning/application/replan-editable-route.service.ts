import { randomUUID } from 'node:crypto';
import { createEditableRouteAssignmentChain } from '../../assignments/domain/validation.chain';
import type { AssignmentValidationContext } from '../../assignments/domain/validation.types';
import { PackageAggregate } from '../../packages/domain/package.aggregate';
import { Coordinates } from '../domain/coordinates';
import { cm3ToM3, gramsToKg } from '../domain/models/clustering-quantities';
import type { CapacityClusterProposal } from '../domain/models/clustering.types';
import type { StopCandidateInput } from '../domain/models/stop-ordering.types';
import type { OrderRouteStopsService } from './order-route-stops.service';
import type {
  PackagePlanningOutcome,
  PendingAssignmentReason,
  PlanningExecutionContext,
} from './ports/plan-and-assign-routes.contract';
import type {
  CreateAssignmentData,
  CreateOutboxEventData,
  CreateRouteStopData,
  PlanningPackageSnapshot,
  UpdatePackageStateData,
} from './ports/planning-assignment-unit-of-work';
import type {
  EditableRouteReplanUnitOfWork,
  ReplanEditableRouteCommand,
  ReplanEditableRouteResult,
  ReplanEditableRouteUseCase,
  UpdateRouteStopSequenceData,
} from './ports/replan-editable-route.contract';

export class ReplanEditableRouteService implements ReplanEditableRouteUseCase {
  constructor(
    private readonly uow: EditableRouteReplanUnitOfWork,
    private readonly orderStopsService: OrderRouteStopsService,
  ) {}

  async execute(
    context: PlanningExecutionContext,
    command: ReplanEditableRouteCommand,
  ): Promise<ReplanEditableRouteResult> {
    const packageIds = command.packageIds ?? [];
    this.validateCommand(command.routeId, packageIds);

    return this.uow.run(context, async (session) => {
      const snapshot = await session.loadEditableRouteSnapshot(
        command.routeId,
        packageIds,
      );

      if (!snapshot) {
        throw new Error(
          `Editable route ${command.routeId} not found in tenant snapshot`,
        );
      }

      if (snapshot.tenantId !== context.tenantId) {
        throw new Error('TENANT_MISMATCH');
      }

      if (snapshot.state !== 'PLANNED') {
        throw new Error(
          `ROUTE_NOT_EDITABLE: Target route '${snapshot.id}' is in status '${snapshot.state}'. Manifest modifications are only permitted when route is PLANNED`,
        );
      }

      if (!snapshot.depot) {
        throw new Error('Depot is required for route stop ordering');
      }

      const requestedPackages = this.resolveRequestedPackages(
        packageIds,
        snapshot.packages,
      );

      const chain = createEditableRouteAssignmentChain();
      let remainingWeightGrams =
        snapshot.vehicle.maxWeightGrams -
        snapshot.vehicle.activeAssignedWeightGrams;
      let remainingVolumeCm3 =
        snapshot.vehicle.maxVolumeCm3 -
        snapshot.vehicle.activeAssignedVolumeCm3;

      const acceptedPackages: PlanningPackageSnapshot[] = [];
      const outcomes: PackagePlanningOutcome[] = [];

      for (const pkg of requestedPackages) {
        if (snapshot.activeAssignmentPackageIds.has(pkg.id)) {
          throw new Error(`Package ${pkg.id} already has an active assignment`);
        }

        const validationContext: AssignmentValidationContext = {
          tenantId: context.tenantId,
          hasDuplicateAssignment: false,
          route: {
            id: snapshot.id,
            status: snapshot.state,
          },
          planning: {
            zoneId: pkg.zoneId ?? undefined,
            datasetId: snapshot.datasetId,
            profile: 'MOTOR_VEHICLE',
          },
          geocoding: pkg.geocodingCandidate
            ? {
                tenantId: context.tenantId,
                addressId: pkg.addressId,
                datasetId: pkg.geocodingCandidate.datasetId,
                datasetStatus: pkg.geocodingCandidate.datasetStatus,
                status: pkg.geocodingCandidate.status,
                selectedCandidateId: pkg.geocodingCandidate.candidateId,
                latitude: pkg.geocodingCandidate.latitude,
                longitude: pkg.geocodingCandidate.longitude,
              }
            : null,
          networkAttachment: pkg.networkAttachment
            ? {
                tenantId: context.tenantId,
                datasetId: snapshot.datasetId,
                geocodingCandidateId: pkg.geocodingCandidate?.candidateId ?? '',
                profile: 'MOTOR_VEHICLE',
                status: pkg.networkAttachment.status,
                roadNodeId: pkg.networkAttachment.roadNodeId,
                roadEdgeId: pkg.networkAttachment.roadEdgeId,
              }
            : null,
          package: {
            id: pkg.id,
            tenantId: pkg.tenantId,
            state: pkg.state,
            recipientAddress: pkg.addressId,
            addressId: pkg.addressId,
            zoneId: pkg.zoneId,
            weightGrams: pkg.weightGrams,
            volumeCm3: pkg.volumeCm3,
          },
          vehicle: {
            id: snapshot.vehicle.id,
            tenantId: snapshot.vehicle.tenantId,
            available:
              snapshot.vehicle.isActive && !snapshot.vehicle.isOccupiedInWindow,
            remainingWeightGrams,
            remainingVolumeCm3,
          },
          courier: {
            id: snapshot.courier.id,
            tenantId: snapshot.courier.tenantId,
            available:
              snapshot.courier.isActive && !snapshot.courier.isOccupiedInWindow,
          },
        };

        const validationResult = chain.handle(validationContext);
        if (!validationResult.ok) {
          if (
            validationResult.code === 'TENANT_MISMATCH' ||
            validationResult.code === 'DUPLICATE_ASSIGNMENT' ||
            validationResult.code === 'ROUTE_NOT_EDITABLE'
          ) {
            throw new Error(
              `${validationResult.code}: ${validationResult.message}`,
            );
          }

          outcomes.push({
            kind: 'PENDING_ASSIGNMENT',
            packageId: pkg.id,
            reasonCode: validationResult.code as PendingAssignmentReason,
            source: 'CHAIN',
            sourceCode: validationResult.code,
            rejectedBy: validationResult.handler,
          });
        } else {
          acceptedPackages.push(pkg);
          remainingWeightGrams -= pkg.weightGrams;
          remainingVolumeCm3 -= pkg.volumeCm3;
        }
      }

      const existingStopByPackageId = new Map(
        snapshot.existingStops.map((s) => [s.packageId, s]),
      );

      const stopCandidates: StopCandidateInput[] = [
        ...snapshot.existingStops.map((s) => ({
          packageId: s.packageId,
          tenantId: context.tenantId,
          coordinates: Coordinates.create(s.latitude, s.longitude),
        })),
        ...acceptedPackages.map((pkg) => ({
          packageId: pkg.id,
          tenantId: context.tenantId,
          coordinates: Coordinates.create(
            pkg.geocodingCandidate!.latitude,
            pkg.geocodingCandidate!.longitude,
          ),
        })),
      ];

      if (stopCandidates.length === 0) {
        return {
          routeId: snapshot.id,
          tenantId: context.tenantId,
          state: 'PLANNED',
          vehicleId: snapshot.vehicleId,
          courierId: snapshot.courierId,
          totalDistanceMeters: 0,
          stops: [],
          outcomes,
        };
      }

      const depotCoordinates = Coordinates.create(
        snapshot.depot.latitude,
        snapshot.depot.longitude,
      );

      const totalWeightGrams = acceptedPackages.reduce(
        (sum, p) => sum + p.weightGrams,
        0,
      );
      const totalVolumeCm3 = acceptedPackages.reduce(
        (sum, p) => sum + p.volumeCm3,
        0,
      );

      const proposal: CapacityClusterProposal = {
        proposalId: `replan-${snapshot.id}`,
        clusterId: `replan-${snapshot.id}`,
        candidateVehicleId: snapshot.vehicleId,
        packageIds: stopCandidates.map((c) => c.packageId),
        totalWeightKg: gramsToKg(totalWeightGrams),
        totalVolumeM3: cm3ToM3(totalVolumeCm3),
      };

      const orderedSequence = this.orderStopsService.execute(
        {
          tenantId: context.tenantId,
          origin: depotCoordinates,
          twoOpt:
            command.ordering === 'nearest-neighbor-two-opt'
              ? { maxIterations: 50, minImprovementMeters: 1 }
              : undefined,
        },
        {
          tenantId: context.tenantId,
          proposal,
        },
        stopCandidates,
      );

      const sequenceUpdates: UpdateRouteStopSequenceData[] = [];
      const stopsToCreate: CreateRouteStopData[] = [];
      const assignmentsToCreate: CreateAssignmentData[] = [];
      const finalStops: Array<{
        routeStopId: string;
        packageId: string;
        sequence: number;
      }> = [];

      for (const stop of orderedSequence.stops) {
        const existingStop = existingStopByPackageId.get(stop.packageId);
        if (existingStop) {
          sequenceUpdates.push({
            routeStopId: existingStop.routeStopId,
            sequence: stop.sequence,
          });
          finalStops.push({
            routeStopId: existingStop.routeStopId,
            packageId: stop.packageId,
            sequence: stop.sequence,
          });
        } else {
          const routeStopId = randomUUID();
          const assignmentId = randomUUID();

          stopsToCreate.push({
            id: routeStopId,
            routeId: snapshot.id,
            sequence: stop.sequence,
            latitude: stop.coordinates.latitude,
            longitude: stop.coordinates.longitude,
            geocodingAttemptId: null,
          });

          assignmentsToCreate.push({
            id: assignmentId,
            packageId: stop.packageId,
            routeId: snapshot.id,
            routeStopId,
            vehicleId: snapshot.vehicleId,
            courierId: snapshot.courierId,
            responsibleUserId: context.actorUserId,
            reasonCode: 'MANUAL_REPLAN_ASSIGNMENT',
          });

          finalStops.push({
            routeStopId,
            packageId: stop.packageId,
            sequence: stop.sequence,
          });

          outcomes.push({
            kind: 'ASSIGNED',
            packageId: stop.packageId,
            routeId: snapshot.id,
            routeStopId,
            assignmentId,
          });
        }
      }

      await session.updateStopSequences(
        snapshot.id,
        sequenceUpdates,
        orderedSequence.totalDistanceMeters,
      );

      if (stopsToCreate.length > 0) {
        await session.createRouteStops(stopsToCreate);
      }
      if (assignmentsToCreate.length > 0) {
        await session.createAssignments(assignmentsToCreate);
      }

      const packageUpdates: UpdatePackageStateData[] = [];
      const outboxEvents: CreateOutboxEventData[] = [];

      for (const outcome of outcomes) {
        const pkgSnapshot = requestedPackages.find(
          (p) => p.id === outcome.packageId,
        );
        if (!pkgSnapshot) continue;

        const targetState =
          outcome.kind === 'ASSIGNED'
            ? 'ASSIGNED_TO_ROUTE'
            : 'PENDING_ASSIGNMENT';
        const reasonCode =
          outcome.kind === 'PENDING_ASSIGNMENT'
            ? outcome.reasonCode
            : 'MANUAL_REPLAN_ASSIGNMENT';

        if (pkgSnapshot.state !== targetState) {
          const aggregate = PackageAggregate.reconstitute({
            id: pkgSnapshot.id,
            tenantId: context.tenantId,
            state: pkgSnapshot.state,
          });

          aggregate.transitionTo(targetState, {
            changedByUserId: context.actorUserId,
            correlationId: context.correlationId,
            reasonCode: reasonCode ?? undefined,
          });

          packageUpdates.push({
            packageId: pkgSnapshot.id,
            fromState: pkgSnapshot.state,
            toState: targetState,
            changedByUserId: context.actorUserId,
            reasonCode,
          });

          for (const event of aggregate.pullDomainEvents()) {
            outboxEvents.push({
              eventId: randomUUID(),
              correlationId: context.correlationId,
              eventType: event.eventType,
              producer: 'sls-backend.route-planning',
              version: event.version ?? 1,
              occurredAt: event.occurredAt,
              payload: {
                ...event,
                occurredAt: event.occurredAt.toISOString(),
              },
            });
          }
        }
      }

      if (packageUpdates.length > 0) {
        await session.updatePackageStates(packageUpdates);
      }
      if (outboxEvents.length > 0) {
        await session.saveOutboxEvents(outboxEvents);
      }

      return {
        routeId: snapshot.id,
        tenantId: context.tenantId,
        state: 'PLANNED',
        vehicleId: snapshot.vehicleId,
        courierId: snapshot.courierId,
        totalDistanceMeters: orderedSequence.totalDistanceMeters,
        stops: finalStops,
        outcomes,
      };
    });
  }

  private validateCommand(
    routeId: string,
    packageIds: readonly string[],
  ): void {
    if (!routeId || routeId.trim().length === 0) {
      throw new Error('routeId is required');
    }
    const seen = new Set<string>();
    for (const id of packageIds) {
      if (!id || id.trim().length === 0) {
        throw new Error('packageIds must contain non-empty IDs');
      }
      if (seen.has(id)) {
        throw new Error(`Duplicate packageId in replan request: ${id}`);
      }
      seen.add(id);
    }
  }

  private resolveRequestedPackages(
    packageIds: readonly string[],
    snapshots: readonly PlanningPackageSnapshot[],
  ): PlanningPackageSnapshot[] {
    const byId = new Map(snapshots.map((p) => [p.id, p]));
    return packageIds.map((id) => {
      const found = byId.get(id);
      if (!found) {
        throw new Error(`Requested package ${id} not found in tenant snapshot`);
      }
      return found;
    });
  }
}
