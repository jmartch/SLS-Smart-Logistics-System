export type VehicleStatusValue = 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE';

export interface VehicleEntry {
  readonly id: string;
  readonly tenantId: string;
  readonly plate: string;
  readonly maxWeightKg: string;
  readonly maxVolumeM3: string;
  readonly status: VehicleStatusValue;
}

export interface CreateVehicleData {
  readonly plate: string;
  readonly maxWeightKg: string;
  readonly maxVolumeM3: string;
}

export type CreateVehicleResult =
  | {
      readonly ok: true;
      readonly vehicle: VehicleEntry;
    }
  | {
      readonly ok: false;
      readonly code: 'VEHICLE_PLATE_CONFLICT';
    };

export interface VehicleRepositoryPort {
  createByTenant(
    tenantId: string,
    data: CreateVehicleData,
  ): Promise<CreateVehicleResult>;
}
