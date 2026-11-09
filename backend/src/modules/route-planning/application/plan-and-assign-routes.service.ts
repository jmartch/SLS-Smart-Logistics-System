import { randomUUID } from 'node:crypto';
import type {
  PlanningExecutionContext,
  PlanAndAssignRoutesCommand,
  PlanAndAssignRoutesResult,
  PlanAndAssignRoutesUseCase,
  PlannedRouteResult,
  PackagePlanningOutcome,
  PendingAssignmentReason,
} from './ports/plan-and-assign-routes.contract';
import type {
  PlanningAssignmentUnitOfWork,
  PlanningPackageSnapshot,
  PlanningVehicleSnapshot,
  PlanningCourierSnapshot,
  CreatePlannedRouteData,
  CreateRouteStopData,
  CreateAssignmentData,
  UpdatePackageStateData,
  CreatePlanningResultData,
  CreateOutboxEventData,
} from './ports/planning-assignment-unit-of-work';
import type { ClusterPackagesService } from './cluster-packages.service';
import type { OrderRouteStopsService } from './order-route-stops.service';
import { Coordinates } from '../domain/coordinates';
import { gramsToKg, cm3ToM3 } from '../domain/models/clustering-quantities';
import type {
  ClusteringPackageInput,
  ClusteringVehicleInput,
} from '../domain/models/clustering.types';
import type { StopCandidateInput } from '../domain/models/stop-ordering.types';
import {
  createPrevalidationChain,
  createAssignmentValidationChain,
} from '../../assignments/domain/validation.chain';
import type { AssignmentValidationContext } from '../../assignments/domain/validation.types';
import { PackageAggregate } from '../../packages/domain/package.aggregate';

export class PlanAndAssignRoutesService implements PlanAndAssignRoutesUseCase {
  constructor(
    private readonly uow: PlanningAssignmentUnitOfWork,
    private readonly clusterService: ClusterPackagesService,
    private readonly orderStopsService: OrderRouteStopsService,
  ) {}

  async execute(
    context: PlanningExecutionContext,
    command: PlanAndAssignRoutesCommand,
  ): Promise<PlanAndAssignRoutesResult> {
    this.validateCommand(command);

    return this.uow.run(context, async (session) => {
      const claim = await session.claimRequest(command.requestId, command);
      if (claim.status === 'COMPLETED') {
        return {
          ...claim.existingResult,
          replayed: true,
        };
      }
      if (claim.status === 'CONFLICT') {
        throw new Error('REQUEST_ID_CONFLICT');
      }

      const snapshot = await session.loadSnapshot(command);

      this.validateTenantIsolation(context.tenantId, snapshot);

      const requestedPackages = this.resolveRequestedPackages(
        command.packageIds,
        snapshot.packages,
      );

      const prevalidationChain = createPrevalidationChain([
        'CLASSIFIED',
        'PENDING_ASSIGNMENT',
      ]);
      const validPackagesForClustering: PlanningPackageSnapshot[] = [];
      const outcomes: PackagePlanningOutcome[] = [];

      for (const pkg of requestedPackages) {
        if (snapshot.activeAssignmentPackageIds.has(pkg.id)) {
          throw new Error(`Package ${pkg.id} already has an active assignment`);
        }

        const prevalidationContext = this.buildPrevalidationContext(
          context.tenantId,
          command,
          pkg,
        );
        const prevalidationResult =
          prevalidationChain.handle(prevalidationContext);

        if (!prevalidationResult.ok) {
          if (
            prevalidationResult.code === 'TENANT_MISMATCH' ||
            prevalidationResult.code === 'DUPLICATE_ASSIGNMENT'
          ) {
            throw new Error(
              `Security validation failed: ${prevalidationResult.code}`,
            );
          }

          outcomes.push({
            kind: 'PENDING_ASSIGNMENT',
            packageId: pkg.id,
            reasonCode: prevalidationResult.code as PendingAssignmentReason,
            source: 'PREVALIDATION',
            sourceCode: prevalidationResult.code,
            rejectedBy: prevalidationResult.handler,
          });
        } else {
          validPackagesForClustering.push(pkg);
        }
      }

      const eligiblePairs = this.pairEligibleFleet(
        command.resourceSelection === 'AUTOMATIC'
          ? snapshot.vehicles.map((v) => v.id)
          : command.vehicleIds,
        command.resourceSelection === 'AUTOMATIC'
          ? snapshot.couriers.map((c) => c.id)
          : command.courierIds,
        snapshot.vehicles,
        snapshot.couriers,
      );

      const plannedRoutes: PlannedRouteResult[] = [];
      const routesToCreate: CreatePlannedRouteData[] = [];
      const stopsToCreate: CreateRouteStopData[] = [];
      const assignmentsToCreate: CreateAssignmentData[] = [];

      if (validPackagesForClustering.length > 0) {
        if (eligiblePairs.length === 0) {
          const availableVehicles = snapshot.vehicles.filter(
            (v) =>
              (command.resourceSelection === 'AUTOMATIC' ||
                command.vehicleIds.includes(v.id)) &&
              v.isActive &&
              !v.isOccupiedInWindow,
          );
          const hasCapacity = availableVehicles.some(
            (v) =>
              v.maxWeightGrams > v.activeAssignedWeightGrams &&
              v.maxVolumeCm3 > v.activeAssignedVolumeCm3,
          );
          const reasonCode: PendingAssignmentReason =
            availableVehicles.length === 0
              ? 'NO_VEHICLE_AVAILABLE'
              : !hasCapacity
                ? 'NO_CAPACITY'
                : 'NO_COURIER_AVAILABLE';

          for (const pkg of validPackagesForClustering) {
            outcomes.push({
              kind: 'PENDING_ASSIGNMENT',
              packageId: pkg.id,
              reasonCode,
              source: 'PREVALIDATION',
              sourceCode: reasonCode,
              rejectedBy: null,
            });
          }
        } else {
          const clusteringPackages = this.mapToClusteringPackages(
            context.tenantId,
            validPackagesForClustering,
          );
          const clusteringVehicles = this.mapToClusteringVehicles(
            context.tenantId,
            eligiblePairs.map((p) => p.vehicle),
          );

          const clusteringResult = this.clusterService.execute(
            { tenantId: context.tenantId, radiusMeters: command.radiusMeters },
            clusteringPackages,
            clusteringVehicles,
          );

          for (const pending of clusteringResult.pendingPackages) {
            outcomes.push({
              kind: 'PENDING_ASSIGNMENT',
              packageId: pending.packageId,
              reasonCode: pending.reason as PendingAssignmentReason,
              source: 'CLUSTER',
              sourceCode: pending.reason,
              rejectedBy: 'ClusterPackagesService',
            });
          }

          if (!snapshot.depot) {
            throw new Error('Depot is required for route stop ordering');
          }
          const depotCoordinates = Coordinates.create(
            snapshot.depot.latitude,
            snapshot.depot.longitude,
          );

          const fullValidationChain = createAssignmentValidationChain([
            'CLASSIFIED',
            'PENDING_ASSIGNMENT',
          ]);

          for (const proposal of clusteringResult.proposals) {
            const pair = eligiblePairs.find(
              (p) => p.vehicle.id === proposal.candidateVehicleId,
            );
            if (!pair) continue;

            const proposalPackages = proposal.packageIds
              .map((id) => validPackagesForClustering.find((p) => p.id === id))
              .filter((p): p is PlanningPackageSnapshot => p !== undefined);

            let remainingWeightGrams =
              pair.vehicle.maxWeightGrams -
              pair.vehicle.activeAssignedWeightGrams;
            let remainingVolumeCm3 =
              pair.vehicle.maxVolumeCm3 - pair.vehicle.activeAssignedVolumeCm3;

            const acceptedProposalPackages: PlanningPackageSnapshot[] = [];

            for (const pkg of proposalPackages) {
              const fullContext: AssignmentValidationContext = {
                tenantId: context.tenantId,
                hasDuplicateAssignment: false,
                planning: {
                  zoneId: command.zoneId,
                  datasetId: command.datasetId,
                  profile: command.profile,
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
                      datasetId: pkg.networkAttachment.datasetId,
                      geocodingCandidateId:
                        pkg.networkAttachment.geocodingCandidateId,
                      profile: pkg.networkAttachment.profile,
                      status: pkg.networkAttachment.status,
                      roadNodeId: pkg.networkAttachment.roadNodeId,
                      roadEdgeId: pkg.networkAttachment.roadEdgeId,
                    }
                  : null,
                package: {
                  id: pkg.id,
                  tenantId: context.tenantId,
                  state: pkg.state,
                  recipientAddress: pkg.addressId,
                  addressId: pkg.addressId,
                  zoneId: pkg.zoneId,
                  weightGrams: pkg.weightGrams,
                  volumeCm3: pkg.volumeCm3,
                },
                vehicle: {
                  id: pair.vehicle.id,
                  tenantId: context.tenantId,
                  available: true,
                  remainingWeightGrams,
                  remainingVolumeCm3,
                },
                courier: {
                  id: pair.courier.id,
                  tenantId: context.tenantId,
                  available: true,
                },
              };

              const validationResult = fullValidationChain.handle(fullContext);

              if (validationResult.ok) {
                acceptedProposalPackages.push(pkg);
                remainingWeightGrams -= pkg.weightGrams;
                remainingVolumeCm3 -= pkg.volumeCm3;
              } else {
                outcomes.push({
                  kind: 'PENDING_ASSIGNMENT',
                  packageId: pkg.id,
                  reasonCode: validationResult.code as PendingAssignmentReason,
                  source: 'CHAIN',
                  sourceCode: validationResult.code,
                  rejectedBy: validationResult.handler,
                });
              }
            }

            if (acceptedProposalPackages.length > 0) {
              const stopCandidates: StopCandidateInput[] =
                acceptedProposalPackages.map((pkg) => ({
                  packageId: pkg.id,
                  tenantId: context.tenantId,
                  coordinates: Coordinates.create(
                    pkg.geocodingCandidate!.latitude,
                    pkg.geocodingCandidate!.longitude,
                  ),
                }));

              const orderedSequence = this.orderStopsService.execute(
                {
                  tenantId: context.tenantId,
                  origin: depotCoordinates,
                  twoOpt: command.twoOpt,
                },
                {
                  tenantId: context.tenantId,
                  proposal: {
                    ...proposal,
                    packageIds: acceptedProposalPackages.map((p) => p.id),
                  },
                },
                stopCandidates,
              );

              const routeId = randomUUID();
              const plannedStops: {
                routeStopId: string;
                packageId: string;
                sequence: number;
              }[] = [];

              for (const stop of orderedSequence.stops) {
                const routeStopId = randomUUID();
                const assignmentId = randomUUID();
                const stopPkg = snapshot.packages.find(
                  (p) => p.id === stop.packageId,
                );

                const attemptId =
                  stopPkg?.geocodingAttemptId ??
                  stopPkg?.geocodingCandidate?.attemptId;

                if (!attemptId) {
                  throw new Error(
                    `Cannot create planned route stop for package ${stop.packageId} without a valid geocodingAttemptId`,
                  );
                }

                stopsToCreate.push({
                  id: routeStopId,
                  routeId,
                  sequence: stop.sequence,
                  latitude: stop.coordinates.latitude,
                  longitude: stop.coordinates.longitude,
                  geocodingAttemptId: attemptId,
                });

                assignmentsToCreate.push({
                  id: assignmentId,
                  packageId: stop.packageId,
                  routeId,
                  routeStopId,
                  vehicleId: pair.vehicle.id,
                  courierId: pair.courier.id,
                  responsibleUserId: context.actorUserId,
                  reasonCode: 'AUTOMATIC_PLANNING',
                });

                plannedStops.push({
                  routeStopId,
                  packageId: stop.packageId,
                  sequence: stop.sequence,
                });

                outcomes.push({
                  kind: 'ASSIGNED',
                  packageId: stop.packageId,
                  routeId,
                  routeStopId,
                  assignmentId,
                });
              }

              routesToCreate.push({
                id: routeId,
                planningRequestId: command.requestId,
                vehicleId: pair.vehicle.id,
                courierId: pair.courier.id,
                depotId: command.depotId,
                plannedStartAt: command.window.startAt,
                plannedEndAt: command.window.endAt,
                plannedDistanceM: orderedSequence.totalDistanceMeters,
              });

              plannedRoutes.push({
                routeId,
                vehicleId: pair.vehicle.id,
                courierId: pair.courier.id,
                state: 'PLANNED',
                stops: plannedStops,
                totalDistanceMeters: orderedSequence.totalDistanceMeters,
              });
            }
          }
        }
      }

      for (const route of routesToCreate) {
        await session.createRoute(route);
      }
      if (stopsToCreate.length > 0) {
        await session.createRouteStops(stopsToCreate);
      }
      if (assignmentsToCreate.length > 0) {
        await session.createAssignments(assignmentsToCreate);
      }

      const packageUpdates: UpdatePackageStateData[] = [];
      const outboxEvents: CreateOutboxEventData[] = [];
      const planningResults: CreatePlanningResultData[] = [];

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
          outcome.kind === 'PENDING_ASSIGNMENT' ? outcome.reasonCode : null;

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

        planningResults.push({
          planningRequestId: command.requestId,
          packageId: pkgSnapshot.id,
          outcome: outcome.kind === 'ASSIGNED' ? 'ASSIGNED' : 'PENDING',
          reasonCode,
          evidence: {
            source:
              outcome.kind === 'PENDING_ASSIGNMENT'
                ? outcome.source
                : 'PLANNER',
            sourceCode:
              outcome.kind === 'PENDING_ASSIGNMENT'
                ? outcome.sourceCode
                : 'SUCCESS',
            rejectedBy:
              outcome.kind === 'PENDING_ASSIGNMENT' ? outcome.rejectedBy : null,
          },
        });
      }

      if (packageUpdates.length > 0) {
        await session.updatePackageStates(packageUpdates);
      }
      if (planningResults.length > 0) {
        await session.savePlanningResults(planningResults);
      }
      if (outboxEvents.length > 0) {
        await session.saveOutboxEvents(outboxEvents);
      }

      const finalResult: PlanAndAssignRoutesResult = {
        requestId: command.requestId,
        tenantId: context.tenantId,
        status: 'COMPLETED',
        replayed: false,
        routes: plannedRoutes,
        outcomes,
      };

      await session.completeRequest(command.requestId, finalResult);

      return finalResult;
    });
  }

  private validateCommand(command: PlanAndAssignRoutesCommand): void {
    if (!command.requestId || command.requestId.trim().length === 0) {
      throw new Error('requestId is required');
    }
    if (!Array.isArray(command.packageIds) || command.packageIds.length === 0) {
      throw new Error('packageIds must be a non-empty array');
    }
    const start = new Date(command.window.startAt).getTime();
    const end = new Date(command.window.endAt).getTime();
    if (Number.isNaN(start) || Number.isNaN(end) || start >= end) {
      throw new Error('Invalid operating window: startAt must be before endAt');
    }
  }

  private validateTenantIsolation(
    tenantId: string,
    snapshot: {
      packages: readonly PlanningPackageSnapshot[];
      vehicles: readonly PlanningVehicleSnapshot[];
      couriers: readonly PlanningCourierSnapshot[];
      depot: { tenantId: string } | null;
    },
  ): void {
    for (const pkg of snapshot.packages) {
      if (pkg.tenantId !== tenantId) {
        throw new Error('TENANT_MISMATCH');
      }
    }
    for (const veh of snapshot.vehicles) {
      if (veh.tenantId !== tenantId) {
        throw new Error('TENANT_MISMATCH');
      }
    }
    for (const cour of snapshot.couriers) {
      if (cour.tenantId !== tenantId) {
        throw new Error('TENANT_MISMATCH');
      }
    }
    if (snapshot.depot && snapshot.depot.tenantId !== tenantId) {
      throw new Error('TENANT_MISMATCH');
    }
  }

  private resolveRequestedPackages(
    requestedIds: readonly string[],
    snapshotPackages: readonly PlanningPackageSnapshot[],
  ): PlanningPackageSnapshot[] {
    const sortedIds = [...requestedIds].sort();
    return sortedIds.map((id) => {
      const found = snapshotPackages.find((p) => p.id === id);
      if (!found) {
        throw new Error(`Requested package ${id} not found in tenant snapshot`);
      }
      return found;
    });
  }

  private buildPrevalidationContext(
    tenantId: string,
    command: PlanAndAssignRoutesCommand,
    pkg: PlanningPackageSnapshot,
  ): AssignmentValidationContext {
    return {
      tenantId,
      hasDuplicateAssignment: false,
      planning: {
        zoneId: command.zoneId,
        datasetId: command.datasetId,
        profile: command.profile,
      },
      geocoding: pkg.geocodingCandidate
        ? {
            tenantId,
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
            tenantId,
            datasetId: pkg.networkAttachment.datasetId,
            geocodingCandidateId: pkg.networkAttachment.geocodingCandidateId,
            profile: pkg.networkAttachment.profile,
            status: pkg.networkAttachment.status,
            roadNodeId: pkg.networkAttachment.roadNodeId,
            roadEdgeId: pkg.networkAttachment.roadEdgeId,
          }
        : null,
      package: {
        id: pkg.id,
        tenantId,
        state: pkg.state,
        recipientAddress: pkg.addressId,
        addressId: pkg.addressId,
        zoneId: pkg.zoneId,
        weightGrams: pkg.weightGrams,
        volumeCm3: pkg.volumeCm3,
      },
      vehicle: null,
      courier: null,
    };
  }

  private pairEligibleFleet(
    vehicleIds: readonly string[],
    courierIds: readonly string[],
    vehicles: readonly PlanningVehicleSnapshot[],
    couriers: readonly PlanningCourierSnapshot[],
  ): { vehicle: PlanningVehicleSnapshot; courier: PlanningCourierSnapshot }[] {
    const eligibleVehicles = vehicles
      .filter(
        (v) =>
          vehicleIds.includes(v.id) &&
          v.isActive &&
          !v.isOccupiedInWindow &&
          v.maxWeightGrams - v.activeAssignedWeightGrams > 0 &&
          v.maxVolumeCm3 - v.activeAssignedVolumeCm3 > 0,
      )
      .sort((a, b) => a.id.localeCompare(b.id));

    const eligibleCouriers = couriers
      .filter(
        (c) => courierIds.includes(c.id) && c.isActive && !c.isOccupiedInWindow,
      )
      .sort((a, b) => a.id.localeCompare(b.id));

    const pairsCount = Math.min(
      eligibleVehicles.length,
      eligibleCouriers.length,
    );
    const pairs: {
      vehicle: PlanningVehicleSnapshot;
      courier: PlanningCourierSnapshot;
    }[] = [];

    for (let i = 0; i < pairsCount; i++) {
      pairs.push({
        vehicle: eligibleVehicles[i],
        courier: eligibleCouriers[i],
      });
    }

    return pairs;
  }

  private mapToClusteringPackages(
    tenantId: string,
    packages: readonly PlanningPackageSnapshot[],
  ): ClusteringPackageInput[] {
    return packages.map((pkg) => ({
      packageId: pkg.id,
      tenantId,
      zoneId: pkg.zoneId!,
      coordinates: Coordinates.create(
        pkg.geocodingCandidate!.latitude,
        pkg.geocodingCandidate!.longitude,
      ),
      weightKg: gramsToKg(pkg.weightGrams),
      volumeM3: cm3ToM3(pkg.volumeCm3),
    }));
  }

  private mapToClusteringVehicles(
    tenantId: string,
    vehicles: readonly PlanningVehicleSnapshot[],
  ): ClusteringVehicleInput[] {
    return vehicles.map((v) => ({
      vehicleId: v.id,
      tenantId,
      availableWeightKg: gramsToKg(
        v.maxWeightGrams - v.activeAssignedWeightGrams,
      ),
      availableVolumeM3: cm3ToM3(v.maxVolumeCm3 - v.activeAssignedVolumeCm3),
    }));
  }
}
