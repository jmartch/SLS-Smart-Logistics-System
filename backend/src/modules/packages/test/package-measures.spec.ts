import { InvalidPackageRegistrationError } from '../domain/invalid-package-registration.error';
import {
    LENGTH_RULE,
    WEIGHT_RULE,
    computeVolumeM3,
    normalizePositiveDecimal,
} from '../domain/package-measures';

function reasonOf(action: () => unknown): string | undefined {
    try {
        action();
    } catch (error) {
        if (error instanceof InvalidPackageRegistrationError) {
            return `${error.field}:${error.reason}`;
        }
        throw error;
    }
    return undefined;
}

describe('normalizePositiveDecimal', () => {
    it('returns a canonical string for numbers and numeric strings', () => {
        expect(normalizePositiveDecimal(2.5, WEIGHT_RULE)).toBe('2.5');
        expect(normalizePositiveDecimal(' 0010.500 ', WEIGHT_RULE)).toBe(
            '10.5',
        );
    });

    it('enforces the column scale and integer digits', () => {
        expect(
            reasonOf(() => normalizePositiveDecimal('1.0001', WEIGHT_RULE)),
        ).toBe('weightKg:TOO_MANY_DECIMALS');
        expect(
            reasonOf(() => normalizePositiveDecimal('10000000', WEIGHT_RULE)),
        ).toBe('weightKg:OUT_OF_RANGE');
        expect(
            reasonOf(() => normalizePositiveDecimal('1.001', LENGTH_RULE)),
        ).toBe('lengthCm:TOO_MANY_DECIMALS');
    });

    it.each([0, '0.00', -1, '-2'])(
        'rejects non-positive values (%j)',
        (value) => {
            expect(
                reasonOf(() => normalizePositiveDecimal(value, WEIGHT_RULE)),
            ).toBe('weightKg:NOT_POSITIVE');
        },
    );

    it.each([undefined, null, ''])('requires a value (%j)', (value) => {
        expect(
            reasonOf(() => normalizePositiveDecimal(value, WEIGHT_RULE)),
        ).toBe('weightKg:REQUIRED');
    });

    it.each([NaN, Infinity, 'abc', '1,5', '1e3', true, {}])(
        'rejects invalid formats (%j)',
        (value) => {
            expect(
                reasonOf(() => normalizePositiveDecimal(value, WEIGHT_RULE)),
            ).toBe('weightKg:INVALID_FORMAT');
        },
    );
});

describe('computeVolumeM3', () => {
    it.each([
        ['30', '20', '10', '0.006'],
        ['100', '100', '100', '1'],
        ['12.34', '5.67', '8.9', '0.000623'],
        ['1.5', '1.5', '1.5', '0.000003'], // 3.375 cm3 -> 3
        ['2.5', '2', '1', '0.000005'],
        ['0.5', '0.5', '2', '0.000001'], // 0.5 cm3 -> redondeo half-up a 1
    ])('computes %s x %s x %s cm = %s m3', (l, w, h, expected) => {
        expect(computeVolumeM3(l, w, h)).toBe(expected);
    });

    it('rejects dimensions so small that the volume rounds to zero', () => {
        expect(reasonOf(() => computeVolumeM3('0.01', '0.01', '0.01'))).toBe(
            'volumeM3:NOT_POSITIVE',
        );
        expect(reasonOf(() => computeVolumeM3('0.7', '0.7', '1'))).toBe(
            'volumeM3:NOT_POSITIVE', // 0.49 cm3 -> 0
        );
    });

    it('rejects a volume that does not fit Decimal(12,6)', () => {
        expect(
            reasonOf(() =>
                computeVolumeM3('99999999.99', '99999999.99', '99999999.99'),
            ),
        ).toBe('volumeM3:OUT_OF_RANGE');
    });

    it('accepts the largest volume that fits', () => {
        // 999999.99 * 999999.99 * 1 = 999999980000.0001 cm3 -> 999999.98 m3
        expect(computeVolumeM3('999999.99', '999999.99', '1.00')).toBe(
            '999999.98',
        );
    });
});
