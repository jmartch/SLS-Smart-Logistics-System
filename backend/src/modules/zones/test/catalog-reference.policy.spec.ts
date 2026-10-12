import { CatalogDomainError } from '../domain/catalog-errors';
import {
  assertCatalogReferences,
  type SectorReference,
  type ZoneReference,
} from '../domain/catalog-reference.policy';
import { InvalidCatalogReferenceError } from '../domain/invalid-catalog-reference.error';

const TENANT_A_ID = '10000000-0000-4000-8000-000000000001';
const TENANT_B_ID = '10000000-0000-4000-8000-000000000002';
const ZONE_ID = '20000000-0000-4000-8000-000000000001';
const OTHER_ZONE_ID = '20000000-0000-4000-8000-000000000002';
const SECTOR_ID = '30000000-0000-4000-8000-000000000001';

function createZoneFixture(
  overrides: Partial<ZoneReference> = {},
): ZoneReference {
  return {
    id: ZONE_ID,
    tenantId: TENANT_A_ID,
    ...overrides,
  };
}

function createSectorFixture(
  overrides: Partial<SectorReference> = {},
): SectorReference {
  return {
    id: SECTOR_ID,
    tenantId: TENANT_A_ID,
    zoneId: ZONE_ID,
    ...overrides,
  };
}

describe('Catalog reference policy', () => {
  describe('assertCatalogReferences', () => {
    it('accepts a sector belonging to the zone and tenant of the operation', () => {
      const zone = createZoneFixture();
      const sector = createSectorFixture();

      const validate = () => assertCatalogReferences(TENANT_A_ID, zone, sector);

      expect(validate).not.toThrow();
    });

    it.each([
      { scenario: 'undefined', sector: undefined },
      { scenario: 'null', sector: null },
    ])(
      'accepts a tenant-owned zone when the sector is $scenario',
      ({ sector }) => {
        const zone = createZoneFixture();

        const validate = () =>
          assertCatalogReferences(TENANT_A_ID, zone, sector);

        expect(validate).not.toThrow();
      },
    );

    it('rejects a zone from another tenant even when no sector is supplied', () => {
      const zone = createZoneFixture({ tenantId: TENANT_B_ID });

      const validate = () => assertCatalogReferences(TENANT_A_ID, zone);

      expect(
        new InvalidCatalogReferenceError('ZONE_TENANT_MISMATCH', 'zoneId'),
      ).toBeInstanceOf(CatalogDomainError);
      expect(validate).toThrow(InvalidCatalogReferenceError);
      expect(validate).toThrow(
        expect.objectContaining({
          code: 'ZONE_TENANT_MISMATCH',
          field: 'zoneId',
          message: 'Zone was not found',
        }),
      );
    });

    it('rejects a sector from another tenant before checking its zone', () => {
      const zone = createZoneFixture();
      const sector = createSectorFixture({
        tenantId: TENANT_B_ID,
        zoneId: OTHER_ZONE_ID,
      });

      const validate = () => assertCatalogReferences(TENANT_A_ID, zone, sector);

      expect(validate).toThrow(InvalidCatalogReferenceError);
      expect(validate).toThrow(
        expect.objectContaining({
          code: 'SECTOR_TENANT_MISMATCH',
          field: 'sectorId',
          message: 'Sector was not found',
        }),
      );
    });

    it('rejects a sector from another zone within the same tenant', () => {
      const zone = createZoneFixture();
      const sector = createSectorFixture({ zoneId: OTHER_ZONE_ID });

      const validate = () => assertCatalogReferences(TENANT_A_ID, zone, sector);

      expect(validate).toThrow(InvalidCatalogReferenceError);
      expect(validate).toThrow(
        expect.objectContaining({
          code: 'SECTOR_ZONE_MISMATCH',
          field: 'sectorId',
          message: 'Sector does not belong to the specified zone',
        }),
      );
    });
  });
});
