import { FindShipmentTypeService } from '../application/find-shipment-type.service';
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
  const findByTenant = jest.fn<
    ReturnType<ShipmentTypeCatalogPort['findByTenant']>,
    Parameters<ShipmentTypeCatalogPort['findByTenant']>
  >();
  const catalog: ShipmentTypeCatalogPort = {
    listByTenant: jest.fn(),
    findByTenant,
    createByTenant: jest.fn(),
  };

  return {
    findByTenant,
    service: new FindShipmentTypeService(catalog),
  };
}

describe('FindShipmentTypeService', () => {
  describe('execute', () => {
    it('returns the found shipment type for the given tenant and id', async () => {
      const { service, findByTenant } = createTestContext();
      const shipmentType = createShipmentTypeFixture();
      findByTenant.mockResolvedValue(shipmentType);

      const result = await service.execute(TENANT_ID, SHIPMENT_TYPE_ID);

      expect(result).toEqual(shipmentType);
      expect(findByTenant).toHaveBeenCalledTimes(1);
      expect(findByTenant).toHaveBeenCalledWith(TENANT_ID, SHIPMENT_TYPE_ID);
    });

    it('returns null when the shipment type is not found', async () => {
      const { service, findByTenant } = createTestContext();
      findByTenant.mockResolvedValue(null);

      const result = await service.execute(TENANT_ID, SHIPMENT_TYPE_ID);

      expect(result).toBeNull();
      expect(findByTenant).toHaveBeenCalledTimes(1);
      expect(findByTenant).toHaveBeenCalledWith(TENANT_ID, SHIPMENT_TYPE_ID);
    });

    it('propagates catalog infrastructure errors', async () => {
      const { service, findByTenant } = createTestContext();
      const infrastructureError = new Error('Database connection failed');
      findByTenant.mockRejectedValue(infrastructureError);

      const result = service.execute(TENANT_ID, SHIPMENT_TYPE_ID);

      await expect(result).rejects.toBe(infrastructureError);
      expect(findByTenant).toHaveBeenCalledTimes(1);
    });
  });
});
