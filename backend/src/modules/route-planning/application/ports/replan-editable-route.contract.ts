import type {
    PackagePlanningOutcome,
    PlanningExecutionContext,
} from './plan-and-assign-routes.contract';
import type {
    CreateAssignmentData,
    CreateOutboxEventData,
    CreateRouteStopData,
    PlanningCourierSnapshot,
    PlanningDepotSnapshot,
    PlanningPackageSnapshot,
    PlanningVehicleSnapshot,
    UpdatePackageStateData,
} from './planning-assignment-unit-of-work';

export interface ReplanEditableRouteCommand {
    readonly routeId: string;
    readonly packageIds?: readonly string[];
    readonly ordering?: 'nearest-neighbor' | 'nearest-neighbor-two-opt';
}

export interface ReplanEditableRouteResult {
    readonly routeId: string;
    readonly tenantId: string;
    readonly state: 'PLANNED';
    readonly vehicleId: string;
    readonly courierId: string;
    readonly totalDistanceMeters: number;
    readonly stops: readonly Readonly<{
        routeStopId: string;
        packageId: string;
        sequence: number;
    }>[];
    readonly outcomes: readonly PackagePlanningOutcome[];
}

export interface EditableRouteExistingStopSnapshot {
    readonly routeStopId: string;
    readonly packageId: string;
    readonly sequence: number;
    readonly latitude: number;
    readonly longitude: number;
}

export interface EditableRouteSnapshot {
    readonly id: string;
    readonly tenantId: string;
    readonly state: string;
    readonly vehicleId: string;
    readonly courierId: string;
    readonly datasetId: string;
    readonly depot: PlanningDepotSnapshot | null;
    readonly existingStops: readonly EditableRouteExistingStopSnapshot[];
    readonly vehicle: PlanningVehicleSnapshot;
    readonly courier: PlanningCourierSnapshot;
    readonly packages: readonly PlanningPackageSnapshot[];
    readonly activeAssignmentPackageIds: ReadonlySet<string>;
}

export interface UpdateRouteStopSequenceData {
    readonly routeStopId: string;
    readonly sequence: number;
}

export interface EditableRouteReplanSession {
    loadEditableRouteSnapshot(
        routeId: string,
        packageIds: readonly string[],
    ): Promise<EditableRouteSnapshot | null>;
    updateStopSequences(
        routeId: string,
        updates: readonly UpdateRouteStopSequenceData[],
        plannedDistanceM: number,
    ): Promise<void>;
    createRouteStops(stops: readonly CreateRouteStopData[]): Promise<void>;
    createAssignments(
        assignments: readonly CreateAssignmentData[],
    ): Promise<void>;
    updatePackageStates(
        updates: readonly UpdatePackageStateData[],
    ): Promise<void>;
    saveOutboxEvents(events: readonly CreateOutboxEventData[]): Promise<void>;
}

export abstract class EditableRouteReplanUnitOfWork {
    abstract run<T>(
        context: PlanningExecutionContext,
        operation: (session: EditableRouteReplanSession) => Promise<T>,
    ): Promise<T>;
}

export interface ReplanEditableRouteUseCase {
    execute(
        context: PlanningExecutionContext,
        command: ReplanEditableRouteCommand,
    ): Promise<ReplanEditableRouteResult>;
}
