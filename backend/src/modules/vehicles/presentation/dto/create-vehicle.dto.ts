export interface CreateVehicleDto {
  readonly plate: string;
  readonly maxWeightKg: number | string;
  readonly maxVolumeM3: number | string;
}
