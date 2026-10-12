import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { SectorCatalogService } from '../application/sector-catalog.service';
import { ZoneCatalogService } from '../application/zone-catalog.service';
import { InvalidCatalogCodeError } from '../domain/catalog-code';
import { InvalidCatalogNameError } from '../domain/catalog-name';
import { ZonesController } from '../presentation/zones.controller';

const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const ZONE_ID = '20000000-0000-4000-8000-000000000001';
const SECTOR_ID = '30000000-0000-4000-8000-000000000001';

function createTestContext() {
  const zoneService = {
    list: jest.fn(),
    create: jest.fn(),
    findById: jest.fn(),
  } as unknown as jest.Mocked<ZoneCatalogService>;

  const sectorService = {
    listByZone: jest.fn(),
    create: jest.fn(),
    findById: jest.fn(),
  } as unknown as jest.Mocked<SectorCatalogService>;

  const controller = new ZonesController(zoneService, sectorService);

  return {
    controller,
    zoneService,
    sectorService,
  };
}

describe('ZonesController', () => {
  describe('listZones', () => {
    it('returns the list of zones from the catalog service', async () => {
      const { controller, zoneService } = createTestContext();
      const zones = [
        { id: ZONE_ID, tenantId: TENANT_ID, code: 'NORTH', name: 'Zona Norte' },
      ];
      zoneService.list.mockResolvedValue(zones);

      const result = await controller.listZones(TENANT_ID);

      expect(result).toEqual(zones);
      expect(zoneService.list).toHaveBeenCalledWith(TENANT_ID);
    });
  });

  describe('createZone', () => {
    it('creates and returns the zone when input is valid', async () => {
      const { controller, zoneService } = createTestContext();
      const createdZone = {
        id: ZONE_ID,
        tenantId: TENANT_ID,
        code: 'NORTH',
        name: 'Zona Norte',
      };
      zoneService.create.mockResolvedValue({
        ok: true,
        zone: createdZone,
      });

      const result = await controller.createZone(TENANT_ID, {
        code: 'NORTH',
        name: 'Zona Norte',
      });

      expect(result).toEqual(createdZone);
      expect(zoneService.create).toHaveBeenCalledWith(TENANT_ID, {
        code: 'NORTH',
        name: 'Zona Norte',
      });
    });

    it('throws ConflictException when a code conflict is returned', async () => {
      const { controller, zoneService } = createTestContext();
      zoneService.create.mockResolvedValue({
        ok: false,
        code: 'CATALOG_CODE_CONFLICT',
      });

      const create = () =>
        controller.createZone(TENANT_ID, { code: 'NORTH', name: 'Zona Norte' });

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
      const { controller, zoneService } = createTestContext();
      zoneService.create.mockRejectedValue(
        new InvalidCatalogCodeError('EMPTY_CODE'),
      );

      const create = () =>
        controller.createZone(TENANT_ID, { code: '', name: 'Zona Norte' });

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

  describe('getZone', () => {
    it('returns the zone when found', async () => {
      const { controller, zoneService } = createTestContext();
      const zone = {
        id: ZONE_ID,
        tenantId: TENANT_ID,
        code: 'NORTH',
        name: 'Zona Norte',
      };
      zoneService.findById.mockResolvedValue(zone);

      const result = await controller.getZone(TENANT_ID, ZONE_ID);

      expect(result).toEqual(zone);
      expect(zoneService.findById).toHaveBeenCalledWith(TENANT_ID, ZONE_ID);
    });

    it('throws NotFoundException when zone is not found', async () => {
      const { controller, zoneService } = createTestContext();
      zoneService.findById.mockResolvedValue(null);

      await expect(controller.getZone(TENANT_ID, ZONE_ID)).rejects.toThrow(
        NotFoundException,
      );
      await expect(
        controller.getZone(TENANT_ID, ZONE_ID),
      ).rejects.toMatchObject({
        response: {
          code: 'CATALOG_RESOURCE_NOT_FOUND',
          message: `Zone with id '${ZONE_ID}' was not found`,
        },
      });
    });
  });

  describe('listSectors', () => {
    it('returns the list of sectors when parent zone exists', async () => {
      const { controller, zoneService, sectorService } = createTestContext();
      const zone = {
        id: ZONE_ID,
        tenantId: TENANT_ID,
        code: 'NORTH',
        name: 'Zona Norte',
      };
      const sectors = [
        {
          id: SECTOR_ID,
          tenantId: TENANT_ID,
          zoneId: ZONE_ID,
          code: 'SEC-A',
          name: 'Sector A',
        },
      ];
      zoneService.findById.mockResolvedValue(zone);
      sectorService.listByZone.mockResolvedValue(sectors);

      const result = await controller.listSectors(TENANT_ID, ZONE_ID);

      expect(result).toEqual(sectors);
      expect(zoneService.findById).toHaveBeenCalledWith(TENANT_ID, ZONE_ID);
      expect(sectorService.listByZone).toHaveBeenCalledWith(TENANT_ID, ZONE_ID);
    });

    it('throws NotFoundException when parent zone does not exist', async () => {
      const { controller, zoneService } = createTestContext();
      zoneService.findById.mockResolvedValue(null);

      await expect(controller.listSectors(TENANT_ID, ZONE_ID)).rejects.toThrow(
        NotFoundException,
      );
      await expect(
        controller.listSectors(TENANT_ID, ZONE_ID),
      ).rejects.toMatchObject({
        response: {
          code: 'CATALOG_RESOURCE_NOT_FOUND',
          message: `Zone with id '${ZONE_ID}' was not found`,
        },
      });
    });
  });

  describe('createSector', () => {
    it('creates and returns the sector when valid', async () => {
      const { controller, sectorService } = createTestContext();
      const createdSector = {
        id: SECTOR_ID,
        tenantId: TENANT_ID,
        zoneId: ZONE_ID,
        code: 'SEC-A',
        name: 'Sector A',
      };
      sectorService.create.mockResolvedValue({
        ok: true,
        sector: createdSector,
      });

      const result = await controller.createSector(TENANT_ID, ZONE_ID, {
        code: 'SEC-A',
        name: 'Sector A',
      });

      expect(result).toEqual(createdSector);
      expect(sectorService.create).toHaveBeenCalledWith(TENANT_ID, {
        zoneId: ZONE_ID,
        code: 'SEC-A',
        name: 'Sector A',
      });
    });

    it('throws NotFoundException when parent zone is not found', async () => {
      const { controller, sectorService } = createTestContext();
      sectorService.create.mockResolvedValue({
        ok: false,
        code: 'ZONE_NOT_FOUND',
      });

      const create = () =>
        controller.createSector(TENANT_ID, ZONE_ID, {
          code: 'SEC-A',
          name: 'Sector A',
        });

      await expect(create()).rejects.toThrow(NotFoundException);
      await expect(create()).rejects.toMatchObject({
        response: {
          code: 'CATALOG_RESOURCE_NOT_FOUND',
          message: 'Zone was not found',
        },
      });
    });

    it('throws ConflictException when sector code conflict is reported', async () => {
      const { controller, sectorService } = createTestContext();
      sectorService.create.mockResolvedValue({
        ok: false,
        code: 'CATALOG_CODE_CONFLICT',
      });

      const create = () =>
        controller.createSector(TENANT_ID, ZONE_ID, {
          code: 'SEC-A',
          name: 'Sector A',
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
      const { controller, sectorService } = createTestContext();
      sectorService.create.mockRejectedValue(
        new InvalidCatalogNameError('EMPTY_NAME'),
      );

      const create = () =>
        controller.createSector(TENANT_ID, ZONE_ID, {
          code: 'SEC-A',
          name: '',
        });

      await expect(create()).rejects.toThrow(BadRequestException);
      await expect(create()).rejects.toMatchObject({
        response: {
          code: 'VALIDATION_ERROR',
          message: 'Catalog name cannot be empty',
          field: 'name',
        },
      });
    });
  });

  describe('getSector', () => {
    it('returns the sector when found and belongs to the zone', async () => {
      const { controller, sectorService } = createTestContext();
      const sector = {
        id: SECTOR_ID,
        tenantId: TENANT_ID,
        zoneId: ZONE_ID,
        code: 'SEC-A',
        name: 'Sector A',
      };
      sectorService.findById.mockResolvedValue(sector);

      const result = await controller.getSector(TENANT_ID, ZONE_ID, SECTOR_ID);

      expect(result).toEqual(sector);
      expect(sectorService.findById).toHaveBeenCalledWith(TENANT_ID, SECTOR_ID);
    });

    it('throws NotFoundException when sector is not found', async () => {
      const { controller, sectorService } = createTestContext();
      sectorService.findById.mockResolvedValue(null);

      await expect(
        controller.getSector(TENANT_ID, ZONE_ID, SECTOR_ID),
      ).rejects.toThrow(NotFoundException);
      await expect(
        controller.getSector(TENANT_ID, ZONE_ID, SECTOR_ID),
      ).rejects.toMatchObject({
        response: {
          code: 'CATALOG_RESOURCE_NOT_FOUND',
          message: `Sector with id '${SECTOR_ID}' was not found`,
        },
      });
    });

    it('throws NotFoundException when sector belongs to another zone', async () => {
      const { controller, sectorService } = createTestContext();
      const sector = {
        id: SECTOR_ID,
        tenantId: TENANT_ID,
        zoneId: 'another-zone-id',
        code: 'SEC-A',
        name: 'Sector A',
      };
      sectorService.findById.mockResolvedValue(sector);

      await expect(
        controller.getSector(TENANT_ID, ZONE_ID, SECTOR_ID),
      ).rejects.toThrow(NotFoundException);
      await expect(
        controller.getSector(TENANT_ID, ZONE_ID, SECTOR_ID),
      ).rejects.toMatchObject({
        response: {
          code: 'CATALOG_RESOURCE_NOT_FOUND',
          message: `Sector with id '${SECTOR_ID}' was not found`,
        },
      });
    });
  });
});
