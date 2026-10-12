import { evaluatePackageReferences } from '../domain/package-reference.policy';

const ZONE = 'z1';
const OTHER_ZONE = 'z2';

describe('evaluatePackageReferences', () => {
    const activeType = { active: true };

    it('accepts an active shipment type without zone or sector', () => {
        expect(
            evaluatePackageReferences(
                { zoneId: null, sectorId: null },
                { shipmentType: activeType, zone: null, sector: null },
            ),
        ).toBeNull();
    });

    it('accepts a sector that belongs to the requested zone', () => {
        expect(
            evaluatePackageReferences(
                { zoneId: ZONE, sectorId: 's1' },
                {
                    shipmentType: activeType,
                    zone: { id: ZONE },
                    sector: { zoneId: ZONE },
                },
            ),
        ).toBeNull();
    });

    it('rejects a missing or inactive shipment type', () => {
        expect(
            evaluatePackageReferences(
                { zoneId: null, sectorId: null },
                { shipmentType: null, zone: null, sector: null },
            ),
        ).toBe('PACKAGE_SHIPMENT_TYPE_NOT_FOUND');
        expect(
            evaluatePackageReferences(
                { zoneId: null, sectorId: null },
                { shipmentType: { active: false }, zone: null, sector: null },
            ),
        ).toBe('PACKAGE_SHIPMENT_TYPE_INACTIVE');
    });

    it('rejects a zone or sector that does not exist in the tenant', () => {
        expect(
            evaluatePackageReferences(
                { zoneId: ZONE, sectorId: null },
                { shipmentType: activeType, zone: null, sector: null },
            ),
        ).toBe('PACKAGE_ZONE_NOT_FOUND');
        expect(
            evaluatePackageReferences(
                { zoneId: ZONE, sectorId: 's1' },
                { shipmentType: activeType, zone: { id: ZONE }, sector: null },
            ),
        ).toBe('PACKAGE_SECTOR_NOT_FOUND');
    });

    it('rejects a sector from a different zone', () => {
        expect(
            evaluatePackageReferences(
                { zoneId: ZONE, sectorId: 's1' },
                {
                    shipmentType: activeType,
                    zone: { id: ZONE },
                    sector: { zoneId: OTHER_ZONE },
                },
            ),
        ).toBe('PACKAGE_SECTOR_ZONE_MISMATCH');
    });
});
