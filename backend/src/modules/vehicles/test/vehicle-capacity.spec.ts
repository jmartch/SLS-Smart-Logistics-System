import { InvalidVehicleError } from '../domain/invalid-vehicle.error';
import {
  normalizeMaxVolumeM3,
  normalizeMaxWeightKg,
} from '../domain/vehicle-capacity';

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

describe('normalizeMaxWeightKg', () => {
  it('accepts numbers and numeric strings and returns a canonical string', () => {
    expect(normalizeMaxWeightKg(1200.5)).toBe('1200.5');
    expect(normalizeMaxWeightKg('1200.500')).toBe('1200.5');
    expect(normalizeMaxWeightKg(' 0750 ')).toBe('750');
    expect(normalizeMaxWeightKg('0.001')).toBe('0.001');
  });

  it('accepts the largest value allowed by Decimal(10,3)', () => {
    expect(normalizeMaxWeightKg('9999999.999')).toBe('9999999.999');
  });

  it.each([undefined, null, '', '  '])('requires a value (%j)', (value) => {
    expect(reasonOf(() => normalizeMaxWeightKg(value))).toBe(
      'maxWeightKg:REQUIRED',
    );
  });

  it.each([0, '0', '0.000', -5, '-1.5'])(
    'rejects zero and negatives (%j)',
    (value) => {
      expect(reasonOf(() => normalizeMaxWeightKg(value))).toBe(
        'maxWeightKg:NOT_POSITIVE',
      );
    },
  );

  it.each([NaN, Infinity, 'abc', '1,5', '12.', '.5', '1e3', true, {}])(
    'rejects invalid formats (%j)',
    (value) => {
      expect(reasonOf(() => normalizeMaxWeightKg(value))).toBe(
        'maxWeightKg:INVALID_FORMAT',
      );
    },
  );

  it('rejects more than 3 decimals instead of rounding', () => {
    expect(reasonOf(() => normalizeMaxWeightKg('1.0001'))).toBe(
      'maxWeightKg:TOO_MANY_DECIMALS',
    );
  });

  it('ignores trailing zeros when counting decimals', () => {
    expect(normalizeMaxWeightKg('1.5000')).toBe('1.5');
  });

  it('rejects values that do not fit the column', () => {
    expect(reasonOf(() => normalizeMaxWeightKg('10000000'))).toBe(
      'maxWeightKg:OUT_OF_RANGE',
    );
  });
});

describe('normalizeMaxVolumeM3', () => {
  it('accepts up to 6 decimals and 6 integer digits', () => {
    expect(normalizeMaxVolumeM3(8.25)).toBe('8.25');
    expect(normalizeMaxVolumeM3('0.000001')).toBe('0.000001');
    expect(normalizeMaxVolumeM3('999999.999999')).toBe('999999.999999');
  });

  it('rejects more than 6 decimals', () => {
    expect(reasonOf(() => normalizeMaxVolumeM3('0.0000001'))).toBe(
      'maxVolumeM3:TOO_MANY_DECIMALS',
    );
  });

  it('rejects out-of-range and non-positive values', () => {
    expect(reasonOf(() => normalizeMaxVolumeM3('1000000'))).toBe(
      'maxVolumeM3:OUT_OF_RANGE',
    );
    expect(reasonOf(() => normalizeMaxVolumeM3(0))).toBe(
      'maxVolumeM3:NOT_POSITIVE',
    );
  });

  it('requires a value', () => {
    expect(reasonOf(() => normalizeMaxVolumeM3(undefined))).toBe(
      'maxVolumeM3:REQUIRED',
    );
  });
});
