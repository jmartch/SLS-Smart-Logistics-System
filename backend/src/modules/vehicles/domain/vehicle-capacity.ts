import {
  InvalidVehicleError,
  type VehicleField,
} from './invalid-vehicle.error';

interface DecimalRule {
  readonly field: VehicleField;
  readonly maxIntegerDigits: number;
  readonly scale: number;
}

// Reflejan las columnas de la base: maxWeightKg Decimal(10,3), maxVolumeM3 Decimal(12,6).
// Con esa escala, kg*1000 (gramos) y m3*1e6 (cm3) siempre son enteros exactos.
const WEIGHT_RULE: DecimalRule = {
  field: 'maxWeightKg',
  maxIntegerDigits: 7,
  scale: 3,
};

const VOLUME_RULE: DecimalRule = {
  field: 'maxVolumeM3',
  maxIntegerDigits: 6,
  scale: 6,
};

function normalizePositiveDecimal(value: unknown, rule: DecimalRule): string {
  if (value === undefined || value === null) {
    throw new InvalidVehicleError(rule.field, 'REQUIRED');
  }

  let text: string;

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new InvalidVehicleError(rule.field, 'INVALID_FORMAT');
    }
    text = String(value);
  } else if (typeof value === 'string') {
    text = value.trim();
    if (text.length === 0) {
      throw new InvalidVehicleError(rule.field, 'REQUIRED');
    }
  } else {
    throw new InvalidVehicleError(rule.field, 'INVALID_FORMAT');
  }

  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) {
    throw new InvalidVehicleError(rule.field, 'INVALID_FORMAT');
  }

  const sign = match[1];
  const integerPart = match[2].replace(/^0+(?=\d)/, '');
  const fractionPart = (match[3] ?? '').replace(/0+$/, '');

  if (sign === '-' || (integerPart === '0' && fractionPart === '')) {
    throw new InvalidVehicleError(rule.field, 'NOT_POSITIVE');
  }

  if (fractionPart.length > rule.scale) {
    throw new InvalidVehicleError(rule.field, 'TOO_MANY_DECIMALS');
  }

  if (integerPart.length > rule.maxIntegerDigits) {
    throw new InvalidVehicleError(rule.field, 'OUT_OF_RANGE');
  }

  return fractionPart.length > 0
    ? `${integerPart}.${fractionPart}`
    : integerPart;
}

export function normalizeMaxWeightKg(value: unknown): string {
  return normalizePositiveDecimal(value, WEIGHT_RULE);
}

export function normalizeMaxVolumeM3(value: unknown): string {
  return normalizePositiveDecimal(value, VOLUME_RULE);
}
