import type {
  PlanningExecutionContext,
  PlanAndAssignRoutesCommand,
  PlanAndAssignRoutesResult,
  PendingAssignmentReason,
} from './plan-and-assign-routes.contract';
import type { PackageStateName } from '../../../packages/domain/package-state.types';

export interface PlanningPackageSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly state: PackageStateName;
  readonly zoneId: string | null;
  readonly addressId: string;
  readonly weightGrams: number;
  readonly volumeCm3: number;
  readonly geocodingCandidate: Readonly<{
    candidateId: string;
    latitude: number;
    longitude: number;
    datasetId: string;
    datasetStatus: 'STAGING' | 'READY' | 'FAILED';
    status: 'MATCHED' | 'REVIEW_REQUIRED' | 'NOT_FOUND';
  }> | null;
  readonly networkAttachment: Readonly<{
    status: 'AUTO_ACCEPTED' | 'REVIEW_REQUIRED' | 'APPROVED' | 'REJECTED';
    roadNodeId: string | null;
    roadEdgeId: string | null;
  }> | null;
}

export interface PlanningVehicleSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly maxWeightGrams: number;
  readonly maxVolumeCm3: number;
  readonly activeAssignedWeightGrams: number;
  readonly activeAssignedVolumeCm3: number;
  readonly isActive: boolean;
  readonly isOccupiedInWindow: boolean;
}

export interface PlanningCourierSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly isActive: boolean;
  readonly isOccupiedInWindow: boolean;
}

export interface PlanningDepotSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly latitude: number;
  readonly longitude: number;
}

export interface PlanningBatchSnapshot {
  readonly packages: readonly PlanningPackageSnapshot[];
  readonly vehicles: readonly PlanningVehicleSnapshot[];
  readonly couriers: readonly PlanningCourierSnapshot[];
  readonly depot: PlanningDepotSnapshot | null;
  readonly activeAssignmentPackageIds: ReadonlySet<string>;
}

export interface CreatePlannedRouteData {
  readonly id: string;
  readonly planningRequestId: string;
  readonly vehicleId: string;
  readonly courierId: string;
  readonly depotId: string;
  readonly plannedStartAt: string;
  readonly plannedEndAt: string;
  readonly plannedDistanceM: number;
}

export interface CreateRouteStopData {
  readonly id: string;
  readonly routeId: string;
  readonly sequence: number;
  readonly latitude: number;
  readonly longitude: number;
  readonly geocodingAttemptId?: string | null;
}

export interface CreateAssignmentData {
  readonly id: string;
  readonly packageId: string;
  readonly routeId: string;
  readonly routeStopId: string;
  readonly vehicleId: string;
  readonly courierId: string;
  readonly responsibleUserId: string;
  readonly reasonCode: string;
}

export interface UpdatePackageStateData {
  readonly packageId: string;
  readonly fromState: PackageStateName;
  readonly toState: PackageStateName;
  readonly changedByUserId: string;
  readonly reasonCode?: string | null;
}

export interface CreatePlanningResultData {
  readonly planningRequestId: string;
  readonly packageId: string;
  readonly outcome: 'ASSIGNED' | 'PENDING';
  readonly reasonCode?: PendingAssignmentReason | null;
  readonly evidence: Record<string, unknown>;
}

export interface CreateOutboxEventData {
  readonly eventId: string;
  readonly correlationId: string;
  readonly eventType: string;
  readonly payload: Record<string, unknown>;
  readonly producer?: string;
  readonly version?: number;
  readonly occurredAt?: Date;
}

export interface PlanningAssignmentSession {
  claimRequest(
    requestId: string,
    command: PlanAndAssignRoutesCommand,
  ): Promise<
    | { readonly status: 'NEW' }
    | {
        readonly status: 'COMPLETED';
        readonly existingResult: PlanAndAssignRoutesResult;
      }
    | { readonly status: 'CONFLICT' }
  >;

  loadSnapshot(
    command: PlanAndAssignRoutesCommand,
  ): Promise<PlanningBatchSnapshot>;

  createRoute(route: CreatePlannedRouteData): Promise<void>;

  createRouteStops(stops: readonly CreateRouteStopData[]): Promise<void>;

  createAssignments(
    assignments: readonly CreateAssignmentData[],
  ): Promise<void>;

  updatePackageStates(
    updates: readonly UpdatePackageStateData[],
  ): Promise<void>;

  savePlanningResults(
    results: readonly CreatePlanningResultData[],
  ): Promise<void>;

  saveOutboxEvents(events: readonly CreateOutboxEventData[]): Promise<void>;

  completeRequest(
    requestId: string,
    result: PlanAndAssignRoutesResult,
  ): Promise<void>;
}

export interface PlanningAssignmentUnitOfWork {
  run<T>(
    context: PlanningExecutionContext,
    operation: (session: PlanningAssignmentSession) => Promise<T>,
  ): Promise<T>;
}
