import { FindZoneService } from '../application/find-zone.service';
import type {
  ZoneCatalogEntry,
  ZoneCatalogPort,
} from '../application/ports/zone-catalog.port';

const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const ZONE_ID = '20000000-0000-4000-8000-000000000001';

function createZoneFixture(
  overrides: Partial<ZoneCatalogEntry> = {},
): ZoneCatalogEntry {
  return {
    id: ZONE_ID,
    tenantId: TENANT_ID,
    code: 'NORTE',
    name: 'Zona norte',
    ...overrides,
  };
}

function createTestContext() {
  const findByTenant = jest.fn<
    ReturnType<ZoneCatalogPort['findByTenant']>,
    Parameters<ZoneCatalogPort['findByTenant']>
  >();
  const catalog: ZoneCatalogPort = {
    listByTenant: jest.fn(),
    findByTenant,
    createByTenant: jest.fn(),
  };

  return {
    findByTenant,
    service: new FindZoneService(catalog),
  };
}

describe('FindZoneService', () => {
  describe('execute', () => {
    it('returns the found zone for the given tenant and zone id', async () => {
      const { service, findByTenant } = createTestContext();
      const zone = createZoneFixture();
      findByTenant.mockResolvedValue(zone);

      const result = await service.execute(TENANT_ID, ZONE_ID);

      expect(result).toEqual(zone);
      expect(findByTenant).toHaveBeenCalledTimes(1);
      expect(findByTenant).toHaveBeenCalledWith(TENANT_ID, ZONE_ID);
    });

    it('returns null when the zone is not found', async () => {
      const { service, findByTenant } = createTestContext();
      findByTenant.mockResolvedValue(null);

      const result = await service.execute(TENANT_ID, ZONE_ID);

      expect(result).toBeNull();
      expect(findByTenant).toHaveBeenCalledTimes(1);
      expect(findByTenant).toHaveBeenCalledWith(TENANT_ID, ZONE_ID);
    });

    it('propagates catalog infrastructure errors', async () => {
      const { service, findByTenant } = createTestContext();
      const infrastructureError = new Error('Database connection failed');
      findByTenant.mockRejectedValue(infrastructureError);

      const result = service.execute(TENANT_ID, ZONE_ID);

      await expect(result).rejects.toBe(infrastructureError);
      expect(findByTenant).toHaveBeenCalledTimes(1);
    });
  });
});
