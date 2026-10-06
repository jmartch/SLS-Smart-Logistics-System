export interface VehicleResourceSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly plate: string;
  readonly status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE';
  readonly maxWeightKg: number;
  readonly maxVolumeM3: number;
}

export interface CourierResourceSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly status: 'ACTIVE' | 'INACTIVE';
}

export interface DepotResourceSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
}

export interface RouteResourceValidationResult {
  readonly isValid: boolean;
  readonly reason?: string;
  readonly vehicle?: VehicleResourceSnapshot;
  readonly courier?: CourierResourceSnapshot;
  readonly depot?: DepotResourceSnapshot;
}

export interface RouteResourcesPort {
  validateResourcesForRoute(
    tenantId: string,
    routeId: string,
    vehicleId: string,
    courierId: string,
    depotId?: string | null,
    windowStart?: Date | null,
    windowEnd?: Date | null,
  ): Promise<RouteResourceValidationResult>;
}
