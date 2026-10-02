import { ListZonesService } from '../application/list-zones.service';
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
  const listByTenant = jest.fn<
    ReturnType<ZoneCatalogPort['listByTenant']>,
    Parameters<ZoneCatalogPort['listByTenant']>
  >();
  const catalog: ZoneCatalogPort = {
    listByTenant,
    findByTenant: jest.fn(),
    createByTenant: jest.fn(),
  };

  return {
    listByTenant,
    service: new ListZonesService(catalog),
  };
}

describe('ListZonesService', () => {
  describe('execute', () => {
    it('returns the list of zones for the given tenant', async () => {
      const { service, listByTenant } = createTestContext();
      const zones: readonly ZoneCatalogEntry[] = [
        createZoneFixture({ code: 'NORTE', name: 'Zona norte' }),
        createZoneFixture({
          id: '20000000-0000-4000-8000-000000000002',
          code: 'SUR',
          name: 'Zona sur',
        }),
      ];
      listByTenant.mockResolvedValue(zones);

      const result = await service.execute(TENANT_ID);

      expect(result).toEqual(zones);
      expect(listByTenant).toHaveBeenCalledTimes(1);
      expect(listByTenant).toHaveBeenCalledWith(TENANT_ID);
    });

    it('returns an empty array when no zones exist for the tenant', async () => {
      const { service, listByTenant } = createTestContext();
      listByTenant.mockResolvedValue([]);

      const result = await service.execute(TENANT_ID);

      expect(result).toEqual([]);
      expect(listByTenant).toHaveBeenCalledTimes(1);
      expect(listByTenant).toHaveBeenCalledWith(TENANT_ID);
    });

    it('propagates catalog infrastructure errors', async () => {
      const { service, listByTenant } = createTestContext();
      const infrastructureError = new Error('Database connection failed');
      listByTenant.mockRejectedValue(infrastructureError);

      const result = service.execute(TENANT_ID);

      await expect(result).rejects.toBe(infrastructureError);
      expect(listByTenant).toHaveBeenCalledTimes(1);
    });
  });
});
