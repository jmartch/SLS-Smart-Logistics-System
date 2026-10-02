import {
  CreateZoneService,
  type CreateZoneCommand,
} from '../application/create-zone.service';
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
    code: 'NORTE',
    name: 'Zona norte',
    ...overrides,
  };
}

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
  const createByTenant = jest.fn<
    ReturnType<ZoneCatalogPort['createByTenant']>,
    Parameters<ZoneCatalogPort['createByTenant']>
  >();
  const catalog: ZoneCatalogPort = {
    listByTenant: jest.fn<
      ReturnType<ZoneCatalogPort['listByTenant']>,
      Parameters<ZoneCatalogPort['listByTenant']>
    >(),
    findByTenant: jest.fn<
      ReturnType<ZoneCatalogPort['findByTenant']>,
      Parameters<ZoneCatalogPort['findByTenant']>
    >(),
    createByTenant,
  };

  return {
    createByTenant,
    service: new CreateZoneService(catalog),
  };
}

describe('CreateZoneService', () => {
  describe('execute', () => {
    it('creates a zone once with normalized values and the tenant of the operation', async () => {
      const { service, createByTenant } = createTestContext();
      const command = createZoneCommandFixture({
        code: ' norte ',
        name: '  Zona río  ',
      });
      const created: CreateZoneResult = {
        ok: true,
        zone: createZoneFixture({ name: 'Zona río' }),
      };
      createByTenant.mockResolvedValue(created);

      const result = await service.execute(TENANT_ID, command);

      expect(result).toEqual(created);
      expect(createByTenant).toHaveBeenCalledTimes(1);
      expect(createByTenant).toHaveBeenCalledWith(TENANT_ID, {
        code: 'NORTE',
        name: 'Zona río',
      });
    });

    it.each([
      {
        scenario: 'the code is empty',
        overrides: { code: '   ' },
        errorType: InvalidCatalogCodeError,
        errorCode: 'EMPTY_CODE',
        field: 'code',
      },
      {
        scenario: 'the name is empty',
        overrides: { name: '   ' },
        errorType: InvalidCatalogNameError,
        errorCode: 'EMPTY_NAME',
        field: 'name',
      },
    ])(
      'rejects invalid values without writing when $scenario',
      async ({ overrides, errorType, errorCode, field }) => {
        const { service, createByTenant } = createTestContext();
        const command = createZoneCommandFixture(overrides);

        const result = service.execute(TENANT_ID, command);

        await expect(result).rejects.toBeInstanceOf(errorType);
        await expect(result).rejects.toMatchObject({ code: errorCode, field });
        expect(createByTenant).not.toHaveBeenCalled();
      },
    );

    it('returns a code conflict reported by the catalog', async () => {
      const { service, createByTenant } = createTestContext();
      const command = createZoneCommandFixture();
      const conflict: CreateZoneResult = {
        ok: false,
        code: 'CATALOG_CODE_CONFLICT',
      };
      createByTenant.mockResolvedValue(conflict);

      const result = await service.execute(TENANT_ID, command);

      expect(result).toEqual(conflict);
      expect(createByTenant).toHaveBeenCalledTimes(1);
      expect(createByTenant).toHaveBeenCalledWith(TENANT_ID, {
        code: 'NORTE',
        name: 'Zona norte',
      });
    });

    it('propagates the original infrastructure error from the catalog', async () => {
      const { service, createByTenant } = createTestContext();
      const command = createZoneCommandFixture();
      const infrastructureError = new Error('Database unavailable');
      createByTenant.mockRejectedValue(infrastructureError);

      const result = service.execute(TENANT_ID, command);

      await expect(result).rejects.toBe(infrastructureError);
      expect(createByTenant).toHaveBeenCalledTimes(1);
    });
  });
});
