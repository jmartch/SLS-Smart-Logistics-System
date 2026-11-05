export interface PlanningExecutionContext {
  readonly tenantId: string;
  readonly actorUserId: string;
  readonly correlationId: string;
}

export interface PlanAndAssignRoutesCommand {
  readonly requestId: string;
  readonly zoneId: string;
  readonly packageIds: readonly string[];
  readonly resourceSelection?: 'AUTOMATIC' | 'MANUAL';
  readonly vehicleIds: readonly string[];
  readonly courierIds: readonly string[];
  readonly depotId: string;
  readonly datasetId: string;
  readonly profile: 'MOTOR_VEHICLE' | 'MOTORCYCLE' | 'BICYCLE' | 'FOOT';
  readonly window: Readonly<{
    startAt: string;
    endAt: string;
  }>;
  readonly radiusMeters: number;
  readonly ordering: 'nearest-neighbor' | 'nearest-neighbor-two-opt';
  readonly twoOpt?: Readonly<{
    maxIterations: number;
    minImprovementMeters: number;
  }>;
}

export type PendingAssignmentReason =
  | 'NO_VEHICLE_AVAILABLE'
  | 'NO_COURIER_AVAILABLE'
  | 'NO_CAPACITY'
  | 'WEIGHT_CAPACITY_EXCEEDED'
  | 'VOLUME_CAPACITY_EXCEEDED'
  | 'NO_JOINT_CAPACITY'
  | 'CAPACITY_EXHAUSTED_BY_HEURISTIC'
  | 'INCOMPLETE_DATA'
  | 'INVALID_COORDINATES'
  | 'GEOCODING_NOT_READY'
  | 'NETWORK_ATTACHMENT_NOT_READY'
  | 'ZONE_NOT_SUPPORTED';

export type PackagePlanningOutcome =
  | Readonly<{
      kind: 'ASSIGNED';
      packageId: string;
      routeId: string;
      routeStopId: string;
      assignmentId: string;
    }>
  | Readonly<{
      kind: 'PENDING_ASSIGNMENT';
      packageId: string;
      reasonCode: PendingAssignmentReason;
      source: 'PREVALIDATION' | 'CLUSTER' | 'CHAIN';
      sourceCode: string;
      rejectedBy: string | null;
    }>;

export interface PlannedRouteResult {
  readonly routeId: string;
  readonly vehicleId: string;
  readonly courierId: string;
  readonly state: 'PLANNED';
  readonly stops: readonly Readonly<{
    routeStopId: string;
    packageId: string;
    sequence: number;
  }>[];
  readonly totalDistanceMeters: number;
}

export interface PlanAndAssignRoutesResult {
  readonly requestId: string;
  readonly tenantId: string;
  readonly status: 'COMPLETED';
  readonly replayed: boolean;
  readonly routes: readonly PlannedRouteResult[];
  readonly outcomes: readonly PackagePlanningOutcome[];
}

export interface PlanAndAssignRoutesUseCase {
  execute(
    context: PlanningExecutionContext,
    command: PlanAndAssignRoutesCommand,
  ): Promise<PlanAndAssignRoutesResult>;
}
