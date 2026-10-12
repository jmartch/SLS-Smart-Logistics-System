export type VehicleField = 'plate' | 'maxWeightKg' | 'maxVolumeM3';

export type InvalidVehicleReason =
  | 'REQUIRED'
  | 'INVALID_FORMAT'
  | 'NOT_POSITIVE'
  | 'TOO_MANY_DECIMALS'
  | 'OUT_OF_RANGE';

export class InvalidVehicleError extends Error {
  constructor(
    readonly field: VehicleField,
    readonly reason: InvalidVehicleReason,
  ) {
    super(`${field}:${reason}`);
    this.name = 'InvalidVehicleError';
  }
}
