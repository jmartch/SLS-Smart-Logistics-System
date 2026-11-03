export interface PlanningWorkspaceWindow {
  readonly startAt: string;
  readonly endAt: string;
}

export interface PlanningWorkspaceQuery {
  readonly tenantId: string;
  readonly zoneId?: string;
  readonly window?: PlanningWorkspaceWindow;
}

export interface PlanningWorkspaceZone {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

export interface PlanningWorkspaceDepot {
  readonly id: string;
  readonly name: string;
  readonly timeZone: string;
  readonly latitude: number;
  readonly longitude: number;
}

export interface PlanningWorkspaceDataset {
  readonly id: string;
  readonly name: string;
  readonly sourceType: 'SYNTHETIC' | 'OSM' | 'LOCAL_VERIFIED';
  readonly coverage: string;
  readonly readyAt: string | null;
}

export interface PlanningWorkspaceVehicle {
  readonly id: string;
  readonly plate: string;
  readonly status: 'ACTIVE';
  readonly maxWeightKg: string;
  readonly maxVolumeM3: string;
  readonly activeAssignedWeightKg: string;
  readonly activeAssignedVolumeM3: string;
  readonly remainingWeightKg: string;
  readonly remainingVolumeM3: string;
  readonly isActive: boolean;
  readonly isOccupiedInWindow: boolean;
  readonly isEligible: boolean;
}

export interface PlanningWorkspaceCourier {
  readonly id: string;
  readonly userId: string;
  readonly email: string;
  readonly status: 'ACTIVE';
  readonly isActive: boolean;
  readonly isOccupiedInWindow: boolean;
  readonly isEligible: boolean;
}

export interface PlanningWorkspacePackage {
  readonly id: string;
  readonly trackingCode: string;
  readonly state: 'CLASSIFIED' | 'PENDING_ASSIGNMENT';
  readonly priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  readonly zoneId: string | null;
  readonly zoneName: string | null;
  readonly sectorId: string | null;
  readonly sectorName: string | null;
  readonly address: string;
  readonly weightKg: string;
  readonly volumeM3: string;
  readonly hasReadyCoordinates: boolean;
  readonly lastPendingReasonCode?: string | null;
  readonly lastStateChangedAt?: string | null;
}

export interface PlanningWorkspaceEditableRoute {
  readonly id: string;
  readonly state: 'PLANNED';
  readonly vehicleId: string;
  readonly vehiclePlate: string;
  readonly courierId: string;
  readonly courierEmail: string;
  readonly depotId: string | null;
  readonly plannedStartAt: string | null;
  readonly plannedEndAt: string | null;
  readonly stopCount: number;
  readonly assignedPackageCount: number;
  readonly assignedWeightKg: string;
  readonly assignedVolumeM3: string;
  readonly remainingWeightKg: string;
  readonly remainingVolumeM3: string;
}

export interface PlanningWorkspaceSnapshot {
  readonly tenantId: string;
  readonly window: PlanningWorkspaceWindow | null;
  readonly zones: readonly PlanningWorkspaceZone[];
  readonly depots: readonly PlanningWorkspaceDepot[];
  readonly datasets: readonly PlanningWorkspaceDataset[];
  readonly vehicles: readonly PlanningWorkspaceVehicle[];
  readonly couriers: readonly PlanningWorkspaceCourier[];
  readonly candidatePackages: readonly PlanningWorkspacePackage[];
  readonly editableRoutes: readonly PlanningWorkspaceEditableRoute[];
}

export abstract class PlanningWorkspaceQueryPort {
  abstract getWorkspace(
    query: PlanningWorkspaceQuery,
  ): Promise<PlanningWorkspaceSnapshot>;
}
