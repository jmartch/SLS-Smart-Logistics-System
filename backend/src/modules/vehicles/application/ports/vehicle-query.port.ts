import type {
  VehicleEntry,
  VehicleStatusValue,
} from './vehicle-repository.port';

export interface ListVehiclesQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly search?: string;
  readonly status?: VehicleStatusValue;
}

export interface VehicleListItem extends VehicleEntry {
  readonly assignedWeightKg: string;
  readonly assignedVolumeM3: string;
  readonly remainingWeightKg: string;
  readonly remainingVolumeM3: string;
}

export interface VehicleListResult {
  readonly items: readonly VehicleListItem[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export abstract class VehicleQueryPort {
  abstract listByTenant(
    tenantId: string,
    query: ListVehiclesQuery,
  ): Promise<VehicleListResult>;
}
