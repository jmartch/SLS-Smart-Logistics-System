import type {
  PlanAndAssignRoutesCommand,
  PlanningExecutionContext,
  PlanAndAssignRoutesResult,
} from '../../application/ports/plan-and-assign-routes.contract';
import type {
  PlanningPackageSnapshot,
  PlanningVehicleSnapshot,
  PlanningCourierSnapshot,
  PlanningDepotSnapshot,
  PlanningBatchSnapshot,
  PlanningAssignmentUnitOfWork,
  PlanningAssignmentSession,
  CreatePlannedRouteData,
  CreateRouteStopData,
  CreateAssignmentData,
  UpdatePackageStateData,
  CreatePlanningResultData,
  CreateOutboxEventData,
} from '../../application/ports/planning-assignment-unit-of-work';

export const DEFAULT_TENANT_ID = '11111111-1111-4111-8111-111111111111';
export const ALT_TENANT_ID = '22222222-2222-4222-8222-222222222222';
export const DEFAULT_USER_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
export const DEFAULT_DEPOT_ID = 'dddddddd-dddd-4ddd-dddd-dddddddddddd';
export const DEFAULT_ZONE_ID = 'zzzzzzzz-zzzz-4zzz-zzzz-zzzzzzzzzzzz';
export const DEFAULT_DATASET_ID = '00000000-0000-4000-8000-000000000001';

export function createPlanningExecutionContext(
  overrides: Partial<PlanningExecutionContext> = {},
): PlanningExecutionContext {
  return {
    tenantId: DEFAULT_TENANT_ID,
    actorUserId: DEFAULT_USER_ID,
    correlationId: 'corr-001',
    ...overrides,
  };
}

export function createPlanningPackage(
  overrides: Partial<PlanningPackageSnapshot> = {},
): PlanningPackageSnapshot {
  const id = overrides.id ?? 'pkg-001';
  return {
    id,
    tenantId: DEFAULT_TENANT_ID,
    state: 'CLASSIFIED',
    zoneId: DEFAULT_ZONE_ID,
    addressId: `addr-${id}`,
    weightGrams: 2000,
    volumeCm3: 5000,
    geocodingCandidate: {
      candidateId: `cand-${id}`,
      latitude: 10.9878,
      longitude: -74.7889,
      datasetId: DEFAULT_DATASET_ID,
      datasetStatus: 'READY',
      status: 'MATCHED',
    },
    networkAttachment: {
      status: 'AUTO_ACCEPTED',
      roadNodeId: `node-${id}`,
      roadEdgeId: null,
    },
    ...overrides,
  };
}

export function createPlanningVehicle(
  overrides: Partial<PlanningVehicleSnapshot> = {},
): PlanningVehicleSnapshot {
  return {
    id: 'veh-001',
    tenantId: DEFAULT_TENANT_ID,
    maxWeightGrams: 100000,
    maxVolumeCm3: 500000,
    activeAssignedWeightGrams: 0,
    activeAssignedVolumeCm3: 0,
    isActive: true,
    isOccupiedInWindow: false,
    ...overrides,
  };
}

export function createPlanningCourier(
  overrides: Partial<PlanningCourierSnapshot> = {},
): PlanningCourierSnapshot {
  return {
    id: 'cour-001',
    tenantId: DEFAULT_TENANT_ID,
    isActive: true,
    isOccupiedInWindow: false,
    ...overrides,
  };
}

export function createPlanningDepot(
  overrides: Partial<PlanningDepotSnapshot> = {},
): PlanningDepotSnapshot {
  return {
    id: DEFAULT_DEPOT_ID,
    tenantId: DEFAULT_TENANT_ID,
    latitude: 10.99,
    longitude: -74.79,
    ...overrides,
  };
}

export function createPlanAndAssignCommand(
  overrides: Partial<PlanAndAssignRoutesCommand> = {},
): PlanAndAssignRoutesCommand {
  return {
    requestId: 'req-001',
    zoneId: DEFAULT_ZONE_ID,
    packageIds: ['pkg-001', 'pkg-002'],
    vehicleIds: ['veh-001'],
    courierIds: ['cour-001'],
    depotId: DEFAULT_DEPOT_ID,
    datasetId: DEFAULT_DATASET_ID,
    profile: 'MOTOR_VEHICLE',
    window: {
      startAt: '2026-10-04T08:00:00Z',
      endAt: '2026-10-04T12:00:00Z',
    },
    radiusMeters: 5000,
    ordering: 'nearest-neighbor',
    ...overrides,
  };
}

export class InMemoryPlanningAssignmentUnitOfWork implements PlanningAssignmentUnitOfWork {
  public routes: CreatePlannedRouteData[] = [];
  public stops: CreateRouteStopData[] = [];
  public assignments: CreateAssignmentData[] = [];
  public packageUpdates: UpdatePackageStateData[] = [];
  public results: CreatePlanningResultData[] = [];
  public outboxEvents: CreateOutboxEventData[] = [];
  public completedRequests: Map<string, PlanAndAssignRoutesResult> = new Map();
  public failurePoint: string | null = null;

  constructor(public snapshot: PlanningBatchSnapshot) {}

  async run<T>(
    context: PlanningExecutionContext,
    operation: (session: PlanningAssignmentSession) => Promise<T>,
  ): Promise<T> {
    const initialRoutes = [...this.routes];
    const initialStops = [...this.stops];
    const initialAssignments = [...this.assignments];
    const initialPackageUpdates = [...this.packageUpdates];
    const initialResults = [...this.results];
    const initialOutboxEvents = [...this.outboxEvents];
    const initialCompletedRequests = new Map(this.completedRequests);

    const session: PlanningAssignmentSession = {
      claimRequest: async (requestId, command) => {
        if (this.completedRequests.has(requestId)) {
          return {
            status: 'COMPLETED',
            existingResult: this.completedRequests.get(requestId)!,
          };
        }
        return { status: 'NEW' };
      },

      loadSnapshot: async () => {
        return this.snapshot;
      },

      createRoute: async (route) => {
        if (this.failurePoint === 'createRoute') {
          throw new Error('Induced failure in createRoute');
        }
        this.routes.push(route);
      },

      createRouteStops: async (stops) => {
        if (this.failurePoint === 'createRouteStops') {
          throw new Error('Induced failure in createRouteStops');
        }
        this.stops.push(...stops);
      },

      createAssignments: async (assignments) => {
        if (this.failurePoint === 'createAssignments') {
          throw new Error('Induced failure in createAssignments');
        }
        this.assignments.push(...assignments);
      },

      updatePackageStates: async (updates) => {
        if (this.failurePoint === 'updatePackageStates') {
          throw new Error('Induced failure in updatePackageStates');
        }
        this.packageUpdates.push(...updates);
      },

      savePlanningResults: async (results) => {
        if (this.failurePoint === 'savePlanningResults') {
          throw new Error('Induced failure in savePlanningResults');
        }
        this.results.push(...results);
      },

      saveOutboxEvents: async (events) => {
        if (this.failurePoint === 'saveOutboxEvents') {
          throw new Error('Induced failure in saveOutboxEvents');
        }
        this.outboxEvents.push(...events);
      },

      completeRequest: async (requestId, result) => {
        if (this.failurePoint === 'completeRequest') {
          throw new Error('Induced failure in completeRequest');
        }
        this.completedRequests.set(requestId, result);
      },
    };

    try {
      return await operation(session);
    } catch (error) {
      this.routes = initialRoutes;
      this.stops = initialStops;
      this.assignments = initialAssignments;
      this.packageUpdates = initialPackageUpdates;
      this.results = initialResults;
      this.outboxEvents = initialOutboxEvents;
      this.completedRequests = initialCompletedRequests;
      throw error;
    }
  }
}
