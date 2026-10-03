import { calculateHaversineDistance } from './haversine';
import { InvalidCoordinatesError } from './invalid-coordinates.error';

const NUMERIC_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

function parseCoordinate(value: unknown): number {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value !== 'string') {
    throw new InvalidCoordinatesError('INVALID_FORMAT');
  }

  const trimmed = value.trim();

  if (!NUMERIC_PATTERN.test(trimmed)) {
    throw new InvalidCoordinatesError('INVALID_FORMAT');
  }

  return Number(trimmed);
}

export class Coordinates {
  public readonly latitude: number;
  public readonly longitude: number;

  private constructor(latitude: number, longitude: number) {
    // Normalización de -0 a 0
    this.latitude = latitude === 0 ? 0 : latitude;
    this.longitude = longitude === 0 ? 0 : longitude;

    Object.freeze(this);
  }

  public static create(latitude: number, longitude: number): Coordinates {
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      throw new InvalidCoordinatesError('INVALID_FORMAT');
    }

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new InvalidCoordinatesError('NON_FINITE_COORDINATE');
    }

    if (latitude < -90 || latitude > 90) {
      throw new InvalidCoordinatesError('LATITUDE_OUT_OF_RANGE');
    }

    if (longitude < -180 || longitude > 180) {
      throw new InvalidCoordinatesError('LONGITUDE_OUT_OF_RANGE');
    }

    return new Coordinates(latitude, longitude);
  }

  public static parse(latitude: unknown, longitude: unknown): Coordinates {
    return Coordinates.create(
      parseCoordinate(latitude),
      parseCoordinate(longitude),
    );
  }

  public equals(other: Coordinates, tolerance: number = 0): boolean {
    if (
      typeof tolerance !== 'number' ||
      !Number.isFinite(tolerance) ||
      tolerance < 0
    ) {
      throw new RangeError('Tolerance must be a finite, non-negative number.');
    }

    return (
      Math.abs(this.latitude - other.latitude) <= tolerance &&
      Math.abs(this.longitude - other.longitude) <= tolerance
    );
  }

  public toString(): string {
    return `${this.latitude}, ${this.longitude}`;
  }

  public distanceTo(other: Coordinates): number {
    return calculateHaversineDistance(this, other);
  }
}
