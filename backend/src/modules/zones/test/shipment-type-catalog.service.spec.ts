import {
  ShipmentTypeCatalogService,
  type CreateShipmentTypeCommand,
} from '../application/shipment-type-catalog.service';
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
  const listByTenant = jest.fn<
    ReturnType<ShipmentTypeCatalogPort['listByTenant']>,
    Parameters<ShipmentTypeCatalogPort['listByTenant']>
  >();
  const findByTenant = jest.fn<
    ReturnType<ShipmentTypeCatalogPort['findByTenant']>,
    Parameters<ShipmentTypeCatalogPort['findByTenant']>
  >();
  const createByTenant = jest.fn<
    ReturnType<ShipmentTypeCatalogPort['createByTenant']>,
    Parameters<ShipmentTypeCatalogPort['createByTenant']>
  >();

  const catalog: ShipmentTypeCatalogPort = {
    listByTenant,
    findByTenant,
    createByTenant,
  };

  return {
    listByTenant,
    findByTenant,
    createByTenant,
    service: new ShipmentTypeCatalogService(catalog),
  };
}

describe('ShipmentTypeCatalogService', () => {
  describe('create', () => {
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

      const result = await service.create(TENANT_ID, command);

      expect(result).toEqual(created);
      expect(createByTenant).toHaveBeenCalledTimes(1);
      expect(createByTenant).toHaveBeenCalledWith(TENANT_ID, {
        code: 'EXPRESS',
        name: 'Envío express',
        active: true,
      });
    });

    it('creates a shipment type with explicit active false', async () => {
      const { service, createByTenant } = createTestContext();
      const command = createShipmentTypeCommandFixture({
        active: false,
      });
      const created: CreateShipmentTypeResult = {
        ok: true,
        shipmentType: createShipmentTypeFixture({ active: false }),
      };
      createByTenant.mockResolvedValue(created);

      const result = await service.create(TENANT_ID, command);

      expect(result).toEqual(created);
      expect(createByTenant).toHaveBeenCalledTimes(1);
      expect(createByTenant).toHaveBeenCalledWith(TENANT_ID, {
        code: 'EXPRESS',
        name: 'Envío Express',
        active: false,
      });
    });

    it('rejects invalid values without writing when the code is empty', async () => {
      const { service, createByTenant } = createTestContext();
      const command = createShipmentTypeCommandFixture({ code: '   ' });

      await expect(service.create(TENANT_ID, command)).rejects.toThrow(
        InvalidCatalogCodeError,
      );
      expect(createByTenant).not.toHaveBeenCalled();
    });

    it('rejects invalid values without writing when the name is empty', async () => {
      const { service, createByTenant } = createTestContext();
      const command = createShipmentTypeCommandFixture({ name: '   ' });

      await expect(service.create(TENANT_ID, command)).rejects.toThrow(
        InvalidCatalogNameError,
      );
      expect(createByTenant).not.toHaveBeenCalled();
    });

    it('returns a code conflict reported by the catalog', async () => {
      const { service, createByTenant } = createTestContext();
      const command = createShipmentTypeCommandFixture();
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
  });

  describe('list', () => {
    it('returns the list of shipment types for the given tenant', async () => {
      const { service, listByTenant } = createTestContext();
      const shipmentTypes: readonly ShipmentTypeCatalogEntry[] = [
        createShipmentTypeFixture({ code: 'EXPRESS', name: 'Envío Express' }),
        createShipmentTypeFixture({
          id: '40000000-0000-4000-8000-000000000002',
          code: 'STANDARD',
          name: 'Envío Estándar',
        }),
      ];
      listByTenant.mockResolvedValue(shipmentTypes);

      const result = await service.list(TENANT_ID);

      expect(result).toEqual(shipmentTypes);
      expect(listByTenant).toHaveBeenCalledTimes(1);
      expect(listByTenant).toHaveBeenCalledWith(TENANT_ID, undefined);
    });

    it('passes the includeInactive filter to the catalog port', async () => {
      const { service, listByTenant } = createTestContext();
      const filter = { includeInactive: true };
      listByTenant.mockResolvedValue([]);

      await service.list(TENANT_ID, filter);

      expect(listByTenant).toHaveBeenCalledTimes(1);
      expect(listByTenant).toHaveBeenCalledWith(TENANT_ID, filter);
    });

    it('returns an empty list when the tenant has no shipment types', async () => {
      const { service, listByTenant } = createTestContext();
      listByTenant.mockResolvedValue([]);

      const result = await service.list(TENANT_ID);

      expect(result).toEqual([]);
      expect(listByTenant).toHaveBeenCalledTimes(1);
      expect(listByTenant).toHaveBeenCalledWith(TENANT_ID, undefined);
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
    it('returns the found shipment type for the given tenant and id', async () => {
      const { service, findByTenant } = createTestContext();
      const shipmentType = createShipmentTypeFixture();
      findByTenant.mockResolvedValue(shipmentType);

      const result = await service.findById(TENANT_ID, SHIPMENT_TYPE_ID);

      expect(result).toEqual(shipmentType);
      expect(findByTenant).toHaveBeenCalledTimes(1);
      expect(findByTenant).toHaveBeenCalledWith(TENANT_ID, SHIPMENT_TYPE_ID);
    });

    it('returns null when the shipment type is not found', async () => {
      const { service, findByTenant } = createTestContext();
      findByTenant.mockResolvedValue(null);

      const result = await service.findById(TENANT_ID, SHIPMENT_TYPE_ID);

      expect(result).toBeNull();
      expect(findByTenant).toHaveBeenCalledTimes(1);
      expect(findByTenant).toHaveBeenCalledWith(TENANT_ID, SHIPMENT_TYPE_ID);
    });

    it('propagates errors from the catalog port', async () => {
      const { service, findByTenant } = createTestContext();
      findByTenant.mockRejectedValue(new Error('Connection timeout'));

      await expect(
        service.findById(TENANT_ID, SHIPMENT_TYPE_ID),
      ).rejects.toThrow('Connection timeout');
      expect(findByTenant).toHaveBeenCalledTimes(1);
    });
  });
});
