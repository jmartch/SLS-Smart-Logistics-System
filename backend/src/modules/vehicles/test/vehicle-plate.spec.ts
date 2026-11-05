import { InvalidVehicleError } from '../domain/invalid-vehicle.error';
import { normalizeVehiclePlate } from '../domain/vehicle-plate';

function reasonOf(action: () => unknown): string | undefined {
  try {
    action();
  } catch (error) {
    if (error instanceof InvalidVehicleError) {
      return `${error.field}:${error.reason}`;
    }
    throw error;
  }
  return undefined;
}

describe('normalizeVehiclePlate', () => {
  it('uppercases and strips spaces and hyphens', () => {
    expect(normalizeVehiclePlate('abc 123')).toBe('ABC123');
    expect(normalizeVehiclePlate(' ab-c1 23 ')).toBe('ABC123');
  });

  it('treats equivalent writings as the same plate', () => {
    expect(normalizeVehiclePlate('abc-123')).toBe(
      normalizeVehiclePlate('ABC 123'),
    );
  });

  it('accepts the minimum and maximum lengths', () => {
    expect(normalizeVehiclePlate('AB123')).toBe('AB123');
    expect(normalizeVehiclePlate('ABCD1234')).toBe('ABCD1234');
  });

  it.each([undefined, null])('requires a value (%s)', (value) => {
    expect(reasonOf(() => normalizeVehiclePlate(value))).toBe('plate:REQUIRED');
  });

  it.each(['', '   ', ' - '])('rejects an empty plate (%j)', (value) => {
    expect(reasonOf(() => normalizeVehiclePlate(value))).toBe('plate:REQUIRED');
  });

  it.each(['AB12', 'ABCD12345', 'ABC#123', 'ÁBC123', 'ABC_123'])(
    'rejects invalid format (%s)',
    (value) => {
      expect(reasonOf(() => normalizeVehiclePlate(value))).toBe(
        'plate:INVALID_FORMAT',
      );
    },
  );

  it.each([123456, {}, ['ABC123']])(
    'rejects non-string input (%j)',
    (value) => {
      expect(reasonOf(() => normalizeVehiclePlate(value))).toBe(
        'plate:INVALID_FORMAT',
      );
    },
  );
});
