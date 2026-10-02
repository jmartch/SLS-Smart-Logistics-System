import {
  CreateShipmentTypeService,
  type CreateShipmentTypeCommand,
} from '../application/create-shipment-type.service';
import type {
  CreateShipmentTypeResult,
  ShipmentTypeCatalogEntry,
  ShipmentTypeCatalogPort,
} from '../application/ports/shipment-type-catalog.port';
import { InvalidCatalogCodeError } from '../domain/catalog-code';
import { InvalidCatalogNameError } from '../domain/catalog-name';

const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const SHIPMENT_TYPE_ID = '40000000-0000-4000-8000-000000000001';

function createShipmentTypeCommandFixture(
  overrides: Partial<CreateShipmentTypeCommand> = {},
): CreateShipmentTypeCommand {
  return {
    code: 'EXPRESS',
    name: 'Envío Express',
    ...overrides,
  };
}

function createShipmentTypeFixture(
  overrides: Partial<ShipmentTypeCatalogEntry> = {},
): ShipmentTypeCatalogEntry {
  return {
    id: SHIPMENT_TYPE_ID,
    tenantId: TENANT_ID,
    code: 'EXPRESS',
    name: 'Envío Express',
    active: true,
    ...overrides,
  };
}

function createTestContext() {
  const createByTenant = jest.fn<
    ReturnType<ShipmentTypeCatalogPort['createByTenant']>,
    Parameters<ShipmentTypeCatalogPort['createByTenant']>
  >();
  const catalog: ShipmentTypeCatalogPort = {
    listByTenant: jest.fn(),
    findByTenant: jest.fn(),
    createByTenant,
  };

  return {
    createByTenant,
    service: new CreateShipmentTypeService(catalog),
  };
}

describe('CreateShipmentTypeService', () => {
  describe('execute', () => {
    it('creates a shipment type with normalized values and active defaulting to true', async () => {
      const { service, createByTenant } = createTestContext();
      const command = createShipmentTypeCommandFixture({
        code: ' express ',
        name: '  Envío express  ',
      });
      const created: CreateShipmentTypeResult = {
        ok: true,
        shipmentType: createShipmentTypeFixture({ name: 'Envío express' }),
      };
      createByTenant.mockResolvedValue(created);

      const result = await service.execute(TENANT_ID, command);

      expect(result).toEqual(created);
      expect(createByTenant).toHaveBeenCalledTimes(1);
      expect(createByTenant).toHaveBeenCalledWith(TENANT_ID, {
        code: 'EXPRESS',
        name: 'Envío express',
        active: true,
      });
    });

    it('creates an inactive shipment type when active is false', async () => {
      const { service, createByTenant } = createTestContext();
      const command = createShipmentTypeCommandFixture({
        active: false,
      });
      const created: CreateShipmentTypeResult = {
        ok: true,
        shipmentType: createShipmentTypeFixture({ active: false }),
      };
      createByTenant.mockResolvedValue(created);

      const result = await service.execute(TENANT_ID, command);

      expect(result).toEqual(created);
      expect(createByTenant).toHaveBeenCalledTimes(1);
      expect(createByTenant).toHaveBeenCalledWith(TENANT_ID, {
        code: 'EXPRESS',
        name: 'Envío Express',
        active: false,
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
        const command = createShipmentTypeCommandFixture(overrides);

        const result = service.execute(TENANT_ID, command);

        await expect(result).rejects.toBeInstanceOf(errorType);
        await expect(result).rejects.toMatchObject({ code: errorCode, field });
        expect(createByTenant).not.toHaveBeenCalled();
      },
    );

    it('returns a code conflict reported by the catalog', async () => {
      const { service, createByTenant } = createTestContext();
      const command = createShipmentTypeCommandFixture();
      const conflict: CreateShipmentTypeResult = {
        ok: false,
        code: 'CATALOG_CODE_CONFLICT',
      };
      createByTenant.mockResolvedValue(conflict);

      const result = await service.execute(TENANT_ID, command);

      expect(result).toEqual(conflict);
      expect(createByTenant).toHaveBeenCalledTimes(1);
      expect(createByTenant).toHaveBeenCalledWith(TENANT_ID, {
        code: 'EXPRESS',
        name: 'Envío Express',
        active: true,
      });
    });

    it('propagates the original infrastructure error from the catalog', async () => {
      const { service, createByTenant } = createTestContext();
      const command = createShipmentTypeCommandFixture();
      const infrastructureError = new Error('Database unavailable');
      createByTenant.mockRejectedValue(infrastructureError);

      const result = service.execute(TENANT_ID, command);

      await expect(result).rejects.toBe(infrastructureError);
      expect(createByTenant).toHaveBeenCalledTimes(1);
    });
  });
});
