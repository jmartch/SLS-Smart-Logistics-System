import {
  SectorCatalogService,
  type CreateSectorCommand,
} from '../application/sector-catalog.service';
import type {
  CreateSectorResult,
  SectorCatalogEntry,
  SectorCatalogPort,
} from '../application/ports/sector-catalog.port';
import { InvalidCatalogCodeError } from '../domain/catalog-code';
import { InvalidCatalogNameError } from '../domain/catalog-name';

const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const ZONE_ID = '20000000-0000-4000-8000-000000000001';
const SECTOR_ID = '30000000-0000-4000-8000-000000000001';

function createSectorCommandFixture(
  overrides: Partial<CreateSectorCommand> = {},
): CreateSectorCommand {
  return {
    zoneId: ZONE_ID,
    code: 'SEC-A',
    name: 'Sector A',
    ...overrides,
  };
}

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
  const findByTenant = jest.fn<
    ReturnType<SectorCatalogPort['findByTenant']>,
    Parameters<SectorCatalogPort['findByTenant']>
  >();
  const createByTenant = jest.fn<
    ReturnType<SectorCatalogPort['createByTenant']>,
    Parameters<SectorCatalogPort['createByTenant']>
  >();

  const catalog: SectorCatalogPort = {
    listByZone,
    findByTenant,
    createByTenant,
  };

  return {
    listByZone,
    findByTenant,
    createByTenant,
    service: new SectorCatalogService(catalog),
  };
}

describe('SectorCatalogService', () => {
  describe('create', () => {
    it('creates a sector once with normalized values, zone id, and tenant of operation', async () => {
      const { service, createByTenant } = createTestContext();
      const command = createSectorCommandFixture({
        code: ' sec-a ',
        name: '  Sector A  ',
      });
      const createdSector: CreateSectorResult = {
        ok: true,
        sector: createSectorFixture({ name: 'Sector A' }),
      };
      createByTenant.mockResolvedValue(createdSector);

      const result = await service.create(TENANT_ID, command);

      expect(result).toEqual(createdSector);
      expect(createByTenant).toHaveBeenCalledTimes(1);
      expect(createByTenant).toHaveBeenCalledWith(TENANT_ID, {
        zoneId: ZONE_ID,
        code: 'SEC-A',
        name: 'Sector A',
      });
    });

    it('rejects invalid values without writing when the code is empty', async () => {
      const { service, createByTenant } = createTestContext();
      const command = createSectorCommandFixture({ code: '   ' });

      await expect(service.create(TENANT_ID, command)).rejects.toThrow(
        InvalidCatalogCodeError,
      );
      expect(createByTenant).not.toHaveBeenCalled();
    });

    it('rejects invalid values without writing when the name is empty', async () => {
      const { service, createByTenant } = createTestContext();
      const command = createSectorCommandFixture({ name: '   ' });

      await expect(service.create(TENANT_ID, command)).rejects.toThrow(
        InvalidCatalogNameError,
      );
      expect(createByTenant).not.toHaveBeenCalled();
    });

    it('returns a code conflict reported by the catalog', async () => {
      const { service, createByTenant } = createTestContext();
      const command = createSectorCommandFixture();
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

    it('returns zone not found reported by the catalog', async () => {
      const { service, createByTenant } = createTestContext();
      const command = createSectorCommandFixture();
      createByTenant.mockResolvedValue({
        ok: false,
        code: 'ZONE_NOT_FOUND',
      });

      const result = await service.create(TENANT_ID, command);

      expect(result).toEqual({
        ok: false,
        code: 'ZONE_NOT_FOUND',
      });
      expect(createByTenant).toHaveBeenCalledTimes(1);
    });

    it('propagates the original infrastructure error from the catalog', async () => {
      const { service, createByTenant } = createTestContext();
      const command = createSectorCommandFixture();
      const infrastructureError = new Error('Database connection failed');
      createByTenant.mockRejectedValue(infrastructureError);

      await expect(service.create(TENANT_ID, command)).rejects.toThrow(
        'Database connection failed',
      );
      expect(createByTenant).toHaveBeenCalledTimes(1);
    });
  });

  describe('listByZone', () => {
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

      const result = await service.listByZone(TENANT_ID, ZONE_ID);

      expect(result).toEqual(sectors);
      expect(listByZone).toHaveBeenCalledTimes(1);
      expect(listByZone).toHaveBeenCalledWith(TENANT_ID, ZONE_ID);
    });

    it('returns an empty list when the zone has no sectors', async () => {
      const { service, listByZone } = createTestContext();
      listByZone.mockResolvedValue([]);

      const result = await service.listByZone(TENANT_ID, ZONE_ID);

      expect(result).toEqual([]);
      expect(listByZone).toHaveBeenCalledTimes(1);
      expect(listByZone).toHaveBeenCalledWith(TENANT_ID, ZONE_ID);
    });

    it('propagates errors from the catalog port', async () => {
      const { service, listByZone } = createTestContext();
      listByZone.mockRejectedValue(new Error('Database unavailable'));

      await expect(service.listByZone(TENANT_ID, ZONE_ID)).rejects.toThrow(
        'Database unavailable',
      );
      expect(listByZone).toHaveBeenCalledTimes(1);
    });
  });

  describe('findById', () => {
    it('returns the found sector for the given tenant and sector id', async () => {
      const { service, findByTenant } = createTestContext();
      const sector = createSectorFixture();
      findByTenant.mockResolvedValue(sector);

      const result = await service.findById(TENANT_ID, SECTOR_ID);

      expect(result).toEqual(sector);
      expect(findByTenant).toHaveBeenCalledTimes(1);
      expect(findByTenant).toHaveBeenCalledWith(TENANT_ID, SECTOR_ID);
    });

    it('returns null when the sector is not found', async () => {
      const { service, findByTenant } = createTestContext();
      findByTenant.mockResolvedValue(null);

      const result = await service.findById(TENANT_ID, SECTOR_ID);

      expect(result).toBeNull();
      expect(findByTenant).toHaveBeenCalledTimes(1);
      expect(findByTenant).toHaveBeenCalledWith(TENANT_ID, SECTOR_ID);
    });

    it('propagates errors from the catalog port', async () => {
      const { service, findByTenant } = createTestContext();
      findByTenant.mockRejectedValue(new Error('Connection timeout'));

      await expect(service.findById(TENANT_ID, SECTOR_ID)).rejects.toThrow(
        'Connection timeout',
      );
      expect(findByTenant).toHaveBeenCalledTimes(1);
    });
  });
});
