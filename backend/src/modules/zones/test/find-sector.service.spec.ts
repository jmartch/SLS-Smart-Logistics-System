import { FindSectorService } from '../application/find-sector.service';
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
  const findByTenant = jest.fn<
    ReturnType<SectorCatalogPort['findByTenant']>,
    Parameters<SectorCatalogPort['findByTenant']>
  >();
  const catalog: SectorCatalogPort = {
    listByZone: jest.fn(),
    findByTenant,
    createByTenant: jest.fn(),
  };

  return {
    findByTenant,
    service: new FindSectorService(catalog),
  };
}

describe('FindSectorService', () => {
  describe('execute', () => {
    it('returns the found sector for the given tenant and sector id', async () => {
      const { service, findByTenant } = createTestContext();
      const sector = createSectorFixture();
      findByTenant.mockResolvedValue(sector);

      const result = await service.execute(TENANT_ID, SECTOR_ID);

      expect(result).toEqual(sector);
      expect(findByTenant).toHaveBeenCalledTimes(1);
      expect(findByTenant).toHaveBeenCalledWith(TENANT_ID, SECTOR_ID);
    });

    it('returns null when the sector is not found', async () => {
      const { service, findByTenant } = createTestContext();
      findByTenant.mockResolvedValue(null);

      const result = await service.execute(TENANT_ID, SECTOR_ID);

      expect(result).toBeNull();
      expect(findByTenant).toHaveBeenCalledTimes(1);
      expect(findByTenant).toHaveBeenCalledWith(TENANT_ID, SECTOR_ID);
    });

    it('propagates catalog infrastructure errors', async () => {
      const { service, findByTenant } = createTestContext();
      const infrastructureError = new Error('Database connection failed');
      findByTenant.mockRejectedValue(infrastructureError);

      const result = service.execute(TENANT_ID, SECTOR_ID);

      await expect(result).rejects.toBe(infrastructureError);
      expect(findByTenant).toHaveBeenCalledTimes(1);
    });
  });
});
