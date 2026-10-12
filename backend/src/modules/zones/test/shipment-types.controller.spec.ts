import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ShipmentTypeCatalogService } from '../application/shipment-type-catalog.service';
import { InvalidCatalogCodeError } from '../domain/catalog-code';
import { ShipmentTypesController } from '../presentation/shipment-types.controller';

const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const SHIPMENT_TYPE_ID = '40000000-0000-4000-8000-000000000001';

function createTestContext() {
  const shipmentTypeService = {
    list: jest.fn(),
    create: jest.fn(),
    findById: jest.fn(),
  } as unknown as jest.Mocked<ShipmentTypeCatalogService>;

  const controller = new ShipmentTypesController(shipmentTypeService);

  return {
    controller,
    shipmentTypeService,
  };
}

describe('ShipmentTypesController', () => {
  describe('listShipmentTypes', () => {
    it('returns active shipment types by default', async () => {
      const { controller, shipmentTypeService } = createTestContext();
      const shipmentTypes = [
        {
          id: SHIPMENT_TYPE_ID,
          tenantId: TENANT_ID,
          code: 'EXPRESS',
          name: 'Envío Express',
          active: true,
        },
      ];
      shipmentTypeService.list.mockResolvedValue(shipmentTypes);

      const result = await controller.listShipmentTypes(TENANT_ID);

      expect(result).toEqual(shipmentTypes);
      expect(shipmentTypeService.list).toHaveBeenCalledWith(TENANT_ID, {
        includeInactive: false,
      });
    });

    it('passes includeInactive true when query parameter is true', async () => {
      const { controller, shipmentTypeService } = createTestContext();
      shipmentTypeService.list.mockResolvedValue([]);

      await controller.listShipmentTypes(TENANT_ID, 'true');

      expect(shipmentTypeService.list).toHaveBeenCalledWith(TENANT_ID, {
        includeInactive: true,
      });
    });
  });

  describe('createShipmentType', () => {
    it('creates and returns the shipment type when input is valid', async () => {
      const { controller, shipmentTypeService } = createTestContext();
      const created = {
        id: SHIPMENT_TYPE_ID,
        tenantId: TENANT_ID,
        code: 'EXPRESS',
        name: 'Envío Express',
        active: true,
      };
      shipmentTypeService.create.mockResolvedValue({
        ok: true,
        shipmentType: created,
      });

      const result = await controller.createShipmentType(TENANT_ID, {
        code: 'EXPRESS',
        name: 'Envío Express',
      });

      expect(result).toEqual(created);
      expect(shipmentTypeService.create).toHaveBeenCalledWith(TENANT_ID, {
        code: 'EXPRESS',
        name: 'Envío Express',
      });
    });

    it('throws ConflictException when a code conflict is returned', async () => {
      const { controller, shipmentTypeService } = createTestContext();
      shipmentTypeService.create.mockResolvedValue({
        ok: false,
        code: 'CATALOG_CODE_CONFLICT',
      });

      const create = () =>
        controller.createShipmentType(TENANT_ID, {
          code: 'EXPRESS',
          name: 'Envío Express',
        });

      await expect(create()).rejects.toThrow(ConflictException);
      await expect(create()).rejects.toMatchObject({
        response: {
          code: 'CATALOG_CODE_CONFLICT',
          message: 'Catalog resource code is already in use',
          field: 'code',
        },
      });
    });

    it('throws BadRequestException when domain validation fails', async () => {
      const { controller, shipmentTypeService } = createTestContext();
      shipmentTypeService.create.mockRejectedValue(
        new InvalidCatalogCodeError('EMPTY_CODE'),
      );

      const create = () =>
        controller.createShipmentType(TENANT_ID, {
          code: '',
          name: 'Envío Express',
        });

      await expect(create()).rejects.toThrow(BadRequestException);
      await expect(create()).rejects.toMatchObject({
        response: {
          code: 'VALIDATION_ERROR',
          message: 'Catalog code cannot be empty',
          field: 'code',
        },
      });
    });
  });

  describe('getShipmentType', () => {
    it('returns the shipment type when found', async () => {
      const { controller, shipmentTypeService } = createTestContext();
      const shipmentType = {
        id: SHIPMENT_TYPE_ID,
        tenantId: TENANT_ID,
        code: 'EXPRESS',
        name: 'Envío Express',
        active: true,
      };
      shipmentTypeService.findById.mockResolvedValue(shipmentType);

      const result = await controller.getShipmentType(
        TENANT_ID,
        SHIPMENT_TYPE_ID,
      );

      expect(result).toEqual(shipmentType);
      expect(shipmentTypeService.findById).toHaveBeenCalledWith(
        TENANT_ID,
        SHIPMENT_TYPE_ID,
      );
    });

    it('throws NotFoundException when shipment type is not found', async () => {
      const { controller, shipmentTypeService } = createTestContext();
      shipmentTypeService.findById.mockResolvedValue(null);

      await expect(
        controller.getShipmentType(TENANT_ID, SHIPMENT_TYPE_ID),
      ).rejects.toThrow(NotFoundException);
      await expect(
        controller.getShipmentType(TENANT_ID, SHIPMENT_TYPE_ID),
      ).rejects.toMatchObject({
        response: {
          code: 'CATALOG_RESOURCE_NOT_FOUND',
          message: `Shipment type with id '${SHIPMENT_TYPE_ID}' was not found`,
        },
      });
    });
  });
});
