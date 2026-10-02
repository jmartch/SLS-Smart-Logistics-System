import { ListSectorsByZoneService } from '../application/list-sectors-by-zone.service';
import type {
  SectorCatalogEntry,
  SectorCatalogPort,
} from '../application/ports/sector-catalog.port';

const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const ZONE_ID = '20000000-0000-4000-8000-000000000001';
const SECTOR_ID = '30000000-0000-4000-8000-000000000001';

function createSectorFixture(
  overrides: Partial<SectorCatalogEntry> = {},
): SectorCatalogEntry {
  return {
    id: SECTOR_ID,
    tenantId: TENANT_ID,
    zoneId: ZONE_ID,
    code: 'SEC-A',
    name: 'Sector A',
    ...overrides,
  };
}

function createTestContext() {
  const listByZone = jest.fn<
    ReturnType<SectorCatalogPort['listByZone']>,
    Parameters<SectorCatalogPort['listByZone']>
  >();
  const catalog: SectorCatalogPort = {
    listByZone,
    findByTenant: jest.fn(),
    createByTenant: jest.fn(),
  };

  return {
    listByZone,
    service: new ListSectorsByZoneService(catalog),
  };
}

describe('ListSectorsByZoneService', () => {
  describe('execute', () => {
    it('returns the list of sectors for the given tenant and zone', async () => {
      const { service, listByZone } = createTestContext();
      const sectors: readonly SectorCatalogEntry[] = [
        createSectorFixture({ code: 'SEC-A', name: 'Sector A' }),
        createSectorFixture({
          id: '30000000-0000-4000-8000-000000000002',
          code: 'SEC-B',
          name: 'Sector B',
        }),
      ];
      listByZone.mockResolvedValue(sectors);

      const result = await service.execute(TENANT_ID, ZONE_ID);

      expect(result).toEqual(sectors);
      expect(listByZone).toHaveBeenCalledTimes(1);
      expect(listByZone).toHaveBeenCalledWith(TENANT_ID, ZONE_ID);
    });

    it('returns an empty array when no sectors exist for the zone', async () => {
      const { service, listByZone } = createTestContext();
      listByZone.mockResolvedValue([]);

      const result = await service.execute(TENANT_ID, ZONE_ID);

      expect(result).toEqual([]);
      expect(listByZone).toHaveBeenCalledTimes(1);
      expect(listByZone).toHaveBeenCalledWith(TENANT_ID, ZONE_ID);
    });

    it('propagates catalog infrastructure errors', async () => {
      const { service, listByZone } = createTestContext();
      const infrastructureError = new Error('Database connection failed');
      listByZone.mockRejectedValue(infrastructureError);

      const result = service.execute(TENANT_ID, ZONE_ID);

      await expect(result).rejects.toBe(infrastructureError);
      expect(listByZone).toHaveBeenCalledTimes(1);
    });
  });
});
