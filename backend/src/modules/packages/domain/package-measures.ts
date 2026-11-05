import {
    InvalidPackageRegistrationError,
    type PackageRegistrationField,
} from './invalid-package-registration.error';

interface DecimalRule {
    readonly field: PackageRegistrationField;
    readonly maxIntegerDigits: number;
    readonly scale: number;
}

// Reflejan las columnas: weightKg Decimal(10,3); lengthCm/widthCm/heightCm Decimal(10,2).
export const WEIGHT_RULE: DecimalRule = {
    field: 'weightKg',
    maxIntegerDigits: 7,
    scale: 3,
};
export const LENGTH_RULE: DecimalRule = {
    field: 'lengthCm',
    maxIntegerDigits: 8,
    scale: 2,
};
export const WIDTH_RULE: DecimalRule = {
    field: 'widthCm',
    maxIntegerDigits: 8,
    scale: 2,
};
export const HEIGHT_RULE: DecimalRule = {
    field: 'heightCm',
    maxIntegerDigits: 8,
    scale: 2,
};

const DIMENSION_SCALE = 2;
const VOLUME_MAX_UNITS = 10n ** 12n; // Decimal(12,6): 6 enteros + 6 decimales

export function normalizePositiveDecimal(
    value: unknown,
    rule: DecimalRule,
): string {
    if (value === undefined || value === null) {
        throw new InvalidPackageRegistrationError(rule.field, 'REQUIRED');
    }

    let text: string;

    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            throw new InvalidPackageRegistrationError(
                rule.field,
                'INVALID_FORMAT',
            );
        }
        text = String(value);
    } else if (typeof value === 'string') {
        text = value.trim();
        if (text.length === 0) {
            throw new InvalidPackageRegistrationError(rule.field, 'REQUIRED');
        }
    } else {
        throw new InvalidPackageRegistrationError(rule.field, 'INVALID_FORMAT');
    }

    const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
    if (!match) {
        throw new InvalidPackageRegistrationError(rule.field, 'INVALID_FORMAT');
    }

    const integerPart = match[2].replace(/^0+(?=\d)/, '');
    const fractionPart = (match[3] ?? '').replace(/0+$/, '');

    if (match[1] === '-' || (integerPart === '0' && fractionPart === '')) {
        throw new InvalidPackageRegistrationError(rule.field, 'NOT_POSITIVE');
    }

    if (fractionPart.length > rule.scale) {
        throw new InvalidPackageRegistrationError(
            rule.field,
            'TOO_MANY_DECIMALS',
        );
    }

    if (integerPart.length > rule.maxIntegerDigits) {
        throw new InvalidPackageRegistrationError(rule.field, 'OUT_OF_RANGE');
    }

    return fractionPart.length > 0
        ? `${integerPart}.${fractionPart}`
        : integerPart;
}

function toScaledInteger(canonical: string, scale: number): bigint {
    const [integerPart, fractionPart = ''] = canonical.split('.');
    return BigInt(integerPart + fractionPart.padEnd(scale, '0'));
}

/**
 * Volumen en m³ coherente con la restricción de la base:
 *   volumeM3 = round(lengthCm * widthCm * heightCm / 1000000, 6)
 * Aritmética entera exacta (sin coma flotante). Con 6 decimales en m³ la
 * resolución es 1 cm³, así que el resultado es round(l*w*h) en cm³.
 */
export function computeVolumeM3(
    lengthCm: string,
    widthCm: string,
    heightCm: string,
): string {
    const product =
        toScaledInteger(lengthCm, DIMENSION_SCALE) *
        toScaledInteger(widthCm, DIMENSION_SCALE) *
        toScaledInteger(heightCm, DIMENSION_SCALE); // = l*w*h * 1e6

    const micrometersCubic = (product + 500_000n) / 1_000_000n; // redondeo half-up

    if (micrometersCubic === 0n) {
        // Las dimensiones son tan pequeñas que el volumen redondea a 0: la base lo rechaza.
        throw new InvalidPackageRegistrationError('volumeM3', 'NOT_POSITIVE');
    }

    if (micrometersCubic >= VOLUME_MAX_UNITS) {
        throw new InvalidPackageRegistrationError('volumeM3', 'OUT_OF_RANGE');
    }

    const integerPart = micrometersCubic / 1_000_000n;
    const fractionPart = (micrometersCubic % 1_000_000n)
        .toString()
        .padStart(6, '0')
        .replace(/0+$/, '');

    return fractionPart.length > 0
        ? `${integerPart}.${fractionPart}`
        : integerPart.toString();
}
