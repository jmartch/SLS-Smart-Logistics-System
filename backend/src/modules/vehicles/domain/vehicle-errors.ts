export abstract class VehicleDomainError extends Error {
  abstract readonly code: string;
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}
export class VehicleNotFoundError extends VehicleDomainError {
  readonly code = 'VEHICLE_NOT_FOUND';
  constructor() {
    super('Vehicle not found');
  }
}
export class VehicleValidationError extends VehicleDomainError {
  readonly code = 'VALIDATION_ERROR';
}
export class VehicleCapacityConflictError extends VehicleDomainError {
  readonly code = 'VEHICLE_CAPACITY_BELOW_LOAD';
  constructor(field: string) {
    super('Capacity cannot be lower than active assigned cargo', field);
  }
}
export class VehicleCommittedError extends VehicleDomainError {
  readonly code = 'VEHICLE_COMMITTED';
  constructor() {
    super('Vehicle is committed to a route or active cargo', 'status');
  }
}
export class VehiclePlateConflictError extends VehicleDomainError {
  readonly code = 'VEHICLE_PLATE_CONFLICT';
  constructor() {
    super('Vehicle plate is already registered', 'plate');
  }
}
export class VehicleConcurrencyError extends VehicleDomainError {
  readonly code = 'VEHICLE_CONCURRENCY_CONFLICT';
  constructor() {
    super('Concurrent modification detected; retry the operation');
  }
}
