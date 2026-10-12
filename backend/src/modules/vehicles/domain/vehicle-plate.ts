import { InvalidVehicleError } from './invalid-vehicle.error';

const PLATE_PATTERN = /^[A-Z0-9]{5,8}$/;

/**
 * Normaliza una placa: sin espacios ni guiones y en mayúsculas.
 * Así "abc 123" y "ABC-123" representan la misma placa dentro del tenant.
 */
export function normalizeVehiclePlate(value: unknown): string {
  if (value === undefined || value === null) {
    throw new InvalidVehicleError('plate', 'REQUIRED');
  }

  if (typeof value !== 'string') {
    throw new InvalidVehicleError('plate', 'INVALID_FORMAT');
  }

  const plate = value.replace(/[\s-]+/g, '').toUpperCase();

  if (plate.length === 0) {
    throw new InvalidVehicleError('plate', 'REQUIRED');
  }

  if (!PLATE_PATTERN.test(plate)) {
    throw new InvalidVehicleError('plate', 'INVALID_FORMAT');
  }

  return plate;
}
