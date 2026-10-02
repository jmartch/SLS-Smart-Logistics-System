import { ListShipmentTypesService } from '../application/list-shipment-types.service';
import type {
  ShipmentTypeCatalogEntry,
  ShipmentTypeCatalogPort,
} from '../application/ports/shipment-type-catalog.port';

const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const SHIPMENT_TYPE_ID = '40000000-0000-4000-8000-000000000001';

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
  const catalog: ShipmentTypeCatalogPort = {
    listByTenant,
    findByTenant: jest.fn(),
    createByTenant: jest.fn(),
  };

  return {
    listByTenant,
    service: new ListShipmentTypesService(catalog),
  };
}

describe('ListShipmentTypesService', () => {
  describe('execute', () => {
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

      const result = await service.execute(TENANT_ID);

      expect(result).toEqual(shipmentTypes);
      expect(listByTenant).toHaveBeenCalledTimes(1);
      expect(listByTenant).toHaveBeenCalledWith(TENANT_ID, undefined);
    });

    it('passes the includeInactive filter to the catalog port', async () => {
      const { service, listByTenant } = createTestContext();
      listByTenant.mockResolvedValue([]);

      const result = await service.execute(TENANT_ID, {
        includeInactive: true,
      });

      expect(result).toEqual([]);
      expect(listByTenant).toHaveBeenCalledTimes(1);
      expect(listByTenant).toHaveBeenCalledWith(TENANT_ID, {
        includeInactive: true,
      });
    });

    it('returns an empty array when no shipment types exist', async () => {
      const { service, listByTenant } = createTestContext();
      listByTenant.mockResolvedValue([]);

      const result = await service.execute(TENANT_ID);

      expect(result).toEqual([]);
      expect(listByTenant).toHaveBeenCalledTimes(1);
      expect(listByTenant).toHaveBeenCalledWith(TENANT_ID, undefined);
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
