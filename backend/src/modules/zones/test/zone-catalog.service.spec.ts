import {
  ZoneCatalogService,
  type CreateZoneCommand,
} from '../application/zone-catalog.service';
import type {
  CreateZoneResult,
  ZoneCatalogEntry,
  ZoneCatalogPort,
} from '../application/ports/zone-catalog.port';
import { InvalidCatalogCodeError } from '../domain/catalog-code';
import { InvalidCatalogNameError } from '../domain/catalog-name';

const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const ZONE_ID = '20000000-0000-4000-8000-000000000001';

function createZoneCommandFixture(
  overrides: Partial<CreateZoneCommand> = {},
): CreateZoneCommand {
  return {
    code: 'NORTH',
    name: 'Zona Norte',
    ...overrides,
  };
}

function createZoneFixture(
  overrides: Partial<ZoneCatalogEntry> = {},
): ZoneCatalogEntry {
  return {
    id: ZONE_ID,
    tenantId: TENANT_ID,
    code: 'NORTH',
    name: 'Zona Norte',
    ...overrides,
  };
}

function createTestContext() {
  const listByTenant = jest.fn<
    ReturnType<ZoneCatalogPort['listByTenant']>,
    Parameters<ZoneCatalogPort['listByTenant']>
  >();
  const findByTenant = jest.fn<
    ReturnType<ZoneCatalogPort['findByTenant']>,
    Parameters<ZoneCatalogPort['findByTenant']>
  >();
  const createByTenant = jest.fn<
    ReturnType<ZoneCatalogPort['createByTenant']>,
    Parameters<ZoneCatalogPort['createByTenant']>
  >();

  const catalog: ZoneCatalogPort = {
    listByTenant,
    findByTenant,
    createByTenant,
  };

  return {
    listByTenant,
    findByTenant,
    createByTenant,
    service: new ZoneCatalogService(catalog),
  };
}

describe('ZoneCatalogService', () => {
  describe('create', () => {
    it('creates a zone once with normalized values and tenant of operation', async () => {
      const { service, createByTenant } = createTestContext();
      const command = createZoneCommandFixture({
        code: ' north ',
        name: '  Zona Norte  ',
      });
      const createdZone: CreateZoneResult = {
        ok: true,
        zone: createZoneFixture({ name: 'Zona Norte' }),
      };
      createByTenant.mockResolvedValue(createdZone);

      const result = await service.create(TENANT_ID, command);

      expect(result).toEqual(createdZone);
      expect(createByTenant).toHaveBeenCalledTimes(1);
      expect(createByTenant).toHaveBeenCalledWith(TENANT_ID, {
        code: 'NORTH',
        name: 'Zona Norte',
      });
    });

    it('rejects invalid values without writing when the code is empty', async () => {
      const { service, createByTenant } = createTestContext();
      const command = createZoneCommandFixture({ code: '   ' });

      await expect(service.create(TENANT_ID, command)).rejects.toThrow(
        InvalidCatalogCodeError,
      );
      expect(createByTenant).not.toHaveBeenCalled();
    });

    it('rejects invalid values without writing when the name is empty', async () => {
      const { service, createByTenant } = createTestContext();
      const command = createZoneCommandFixture({ name: '   ' });

      await expect(service.create(TENANT_ID, command)).rejects.toThrow(
        InvalidCatalogNameError,
      );
      expect(createByTenant).not.toHaveBeenCalled();
    });

    it('returns a code conflict reported by the catalog', async () => {
      const { service, createByTenant } = createTestContext();
      const command = createZoneCommandFixture();
      createByTenant.mockResolvedValue({
        ok: false,
        code: 'CATALOG_CODE_CONFLICT',
      });

      const result = await service.create(TENANT_ID, command);

      expect(result).toEqual({
        ok: false,
        code: 'CATALOG_CODE_CONFLICT',
      });
      expect(createByTenant).toHaveBeenCalledTimes(1);
    });

    it('propagates the original infrastructure error from the catalog', async () => {
      const { service, createByTenant } = createTestContext();
      const command = createZoneCommandFixture();
      const infrastructureError = new Error('Database connection failed');
      createByTenant.mockRejectedValue(infrastructureError);

      await expect(service.create(TENANT_ID, command)).rejects.toThrow(
        'Database connection failed',
      );
      expect(createByTenant).toHaveBeenCalledTimes(1);
    });
  });

  describe('list', () => {
    it('returns the list of zones for the given tenant', async () => {
      const { service, listByTenant } = createTestContext();
      const zones: readonly ZoneCatalogEntry[] = [
        createZoneFixture({ code: 'NORTH', name: 'Zona Norte' }),
        createZoneFixture({
          id: '20000000-0000-4000-8000-000000000002',
          code: 'SOUTH',
          name: 'Zona Sur',
        }),
      ];
      listByTenant.mockResolvedValue(zones);

      const result = await service.list(TENANT_ID);

      expect(result).toEqual(zones);
      expect(listByTenant).toHaveBeenCalledTimes(1);
      expect(listByTenant).toHaveBeenCalledWith(TENANT_ID);
    });

    it('returns an empty list when the tenant has no zones', async () => {
      const { service, listByTenant } = createTestContext();
      listByTenant.mockResolvedValue([]);

      const result = await service.list(TENANT_ID);

      expect(result).toEqual([]);
      expect(listByTenant).toHaveBeenCalledTimes(1);
      expect(listByTenant).toHaveBeenCalledWith(TENANT_ID);
    });

    it('propagates errors from the catalog port', async () => {
      const { service, listByTenant } = createTestContext();
      listByTenant.mockRejectedValue(new Error('Database unavailable'));

      await expect(service.list(TENANT_ID)).rejects.toThrow(
        'Database unavailable',
      );
      expect(listByTenant).toHaveBeenCalledTimes(1);
    });
  });

  describe('findById', () => {
    it('returns the found zone for the given tenant and zone id', async () => {
      const { service, findByTenant } = createTestContext();
      const zone = createZoneFixture();
      findByTenant.mockResolvedValue(zone);

      const result = await service.findById(TENANT_ID, ZONE_ID);

      expect(result).toEqual(zone);
      expect(findByTenant).toHaveBeenCalledTimes(1);
      expect(findByTenant).toHaveBeenCalledWith(TENANT_ID, ZONE_ID);
    });

    it('returns null when the zone is not found', async () => {
      const { service, findByTenant } = createTestContext();
      findByTenant.mockResolvedValue(null);

      const result = await service.findById(TENANT_ID, ZONE_ID);

      expect(result).toBeNull();
      expect(findByTenant).toHaveBeenCalledTimes(1);
      expect(findByTenant).toHaveBeenCalledWith(TENANT_ID, ZONE_ID);
    });

    it('propagates errors from the catalog port', async () => {
      const { service, findByTenant } = createTestContext();
      findByTenant.mockRejectedValue(new Error('Connection timeout'));

      await expect(service.findById(TENANT_ID, ZONE_ID)).rejects.toThrow(
        'Connection timeout',
      );
      expect(findByTenant).toHaveBeenCalledTimes(1);
    });
  });
});
