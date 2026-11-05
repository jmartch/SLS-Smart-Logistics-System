import { InvalidPackageRegistrationError } from '../domain/invalid-package-registration.error';
import { parsePackageRegistration } from '../domain/package-registration';

const SHIPMENT_TYPE_ID = '50000000-0000-4000-8000-000000000001';
const ZONE_ID = '60000000-0000-4000-8000-000000000001';
const SECTOR_ID = '70000000-0000-4000-8000-000000000001';

function validInput(overrides: Record<string, unknown> = {}) {
    return {
        trackingCode: 'pkg-0001',
        address: { text: '  Calle 72 # 45-10  ', municipalityCode: '08001' },
        shipmentTypeId: SHIPMENT_TYPE_ID,
        weightKg: 2.5,
        lengthCm: 30,
        widthCm: 20,
        heightCm: 10,
        ...overrides,
    };
}

function reasonOf(input: unknown): string | undefined {
    try {
        parsePackageRegistration(input);
    } catch (error) {
        if (error instanceof InvalidPackageRegistrationError) {
            return `${error.field}:${error.reason}`;
        }
        throw error;
    }
    return undefined;
}

describe('parsePackageRegistration', () => {
    it('normalizes a minimal valid request and applies defaults', () => {
        expect(parsePackageRegistration(validInput())).toEqual({
            trackingCode: 'PKG-0001',
            addressText: 'Calle 72 # 45-10',
            municipalityCode: '08001',
            shipmentTypeId: SHIPMENT_TYPE_ID,
            zoneId: null,
            sectorId: null,
            weightKg: '2.5',
            lengthCm: '30',
            widthCm: '20',
            heightCm: '10',
            volumeM3: '0.006',
            priority: 'NORMAL',
            deadline: null,
            serviceDurationSeconds: null,
            initialState: 'REGISTERED',
        });
    });

    it('accepts optional zone, sector, priority, deadline and service duration', () => {
        const result = parsePackageRegistration(
            validInput({
                zoneId: ZONE_ID.toUpperCase(),
                sectorId: SECTOR_ID,
                priority: 'urgent',
                deadline: '2026-10-20T17:00:00Z',
                serviceDurationSeconds: 300,
            }),
        );

        expect(result.zoneId).toBe(ZONE_ID);
        expect(result.sectorId).toBe(SECTOR_ID);
        expect(result.priority).toBe('URGENT');
        expect(result.deadline).toEqual(new Date('2026-10-20T17:00:00Z'));
        expect(result.serviceDurationSeconds).toBe(300);
    });

    it('ignores unknown fields such as legacy coordinates', () => {
        expect(() =>
            parsePackageRegistration(
                validInput({ latitude: 10.9, longitude: -74.8 }),
            ),
        ).not.toThrow();
    });

    it('always starts in REGISTERED regardless of input', () => {
        expect(
            parsePackageRegistration(validInput({ state: 'DELIVERED' }))
                .initialState,
        ).toBe('REGISTERED');
    });

    it.each([
        [undefined, 'trackingCode:REQUIRED'],
        [{ trackingCode: '' }, 'trackingCode:REQUIRED'],
        [{ trackingCode: 'ab' }, 'trackingCode:INVALID_FORMAT'],
        [{ trackingCode: 'PKG 0001' }, 'trackingCode:INVALID_FORMAT'],
        [{ trackingCode: 'A'.repeat(41) }, 'trackingCode:INVALID_FORMAT'],
        [{ trackingCode: 12345 }, 'trackingCode:INVALID_FORMAT'],
        [{ address: undefined }, 'address:REQUIRED'],
        [{ address: 'Calle 1' }, 'address:INVALID_FORMAT'],
        [
            { address: { text: '', municipalityCode: '08001' } },
            'address:REQUIRED',
        ],
        [
            { address: { text: 'x'.repeat(301), municipalityCode: '08001' } },
            'address:OUT_OF_RANGE',
        ],
        [{ address: { text: 'Calle 1' } }, 'municipalityCode:REQUIRED'],
        [
            { address: { text: 'Calle 1', municipalityCode: '08 001' } },
            'municipalityCode:INVALID_FORMAT',
        ],
        [{ shipmentTypeId: undefined }, 'shipmentTypeId:REQUIRED'],
        [{ shipmentTypeId: 'no-uuid' }, 'shipmentTypeId:INVALID_FORMAT'],
        [{ zoneId: 'no-uuid' }, 'zoneId:INVALID_FORMAT'],
        [{ sectorId: SECTOR_ID }, 'sectorId:SECTOR_REQUIRES_ZONE'],
        [{ weightKg: 0 }, 'weightKg:NOT_POSITIVE'],
        [{ weightKg: undefined }, 'weightKg:REQUIRED'],
        [{ lengthCm: -5 }, 'lengthCm:NOT_POSITIVE'],
        [{ widthCm: '1.234' }, 'widthCm:TOO_MANY_DECIMALS'],
        [
            { lengthCm: 0.01, widthCm: 0.01, heightCm: 0.01 },
            'volumeM3:NOT_POSITIVE',
        ],
        [{ priority: 'ASAP' }, 'priority:INVALID_FORMAT'],
        [{ priority: 5 }, 'priority:INVALID_FORMAT'],
        [{ deadline: 'mañana' }, 'deadline:INVALID_FORMAT'],
        [{ deadline: '2026-10-20' }, 'deadline:INVALID_FORMAT'],
        [{ deadline: '2026-13-45T10:00:00Z' }, 'deadline:INVALID_FORMAT'],
        [{ serviceDurationSeconds: 0 }, 'serviceDurationSeconds:NOT_POSITIVE'],
        [
            { serviceDurationSeconds: 1.5 },
            'serviceDurationSeconds:INVALID_FORMAT',
        ],
        [
            { serviceDurationSeconds: '300' },
            'serviceDurationSeconds:INVALID_FORMAT',
        ],
        [
            { serviceDurationSeconds: 86401 },
            'serviceDurationSeconds:OUT_OF_RANGE',
        ],
    ])('rejects invalid input (%j) -> %s', (overrides, expected) => {
        const input =
            overrides === undefined ? undefined : validInput(overrides);

        expect(reasonOf(overrides === undefined ? {} : input)).toBe(expected);
    });

    it('treats a non-object body as empty input', () => {
        expect(reasonOf(null)).toBe('trackingCode:REQUIRED');
        expect(reasonOf('texto')).toBe('trackingCode:REQUIRED');
        expect(reasonOf([])).toBe('trackingCode:REQUIRED');
    });
});
