import { Test } from '@nestjs/testing';
import { CreateSectorService } from '../application/create-sector.service';
import { CreateShipmentTypeService } from '../application/create-shipment-type.service';
import { CreateZoneService } from '../application/create-zone.service';
import { FindSectorService } from '../application/find-sector.service';
import { FindShipmentTypeService } from '../application/find-shipment-type.service';
import { FindZoneService } from '../application/find-zone.service';
import { ListSectorsByZoneService } from '../application/list-sectors-by-zone.service';
import { ListShipmentTypesService } from '../application/list-shipment-types.service';
import { ListZonesService } from '../application/list-zones.service';
import { PrismaSectorCatalogAdapter } from '../infrastructure/prisma-sector-catalog.adapter';
import { PrismaShipmentTypeCatalogAdapter } from '../infrastructure/prisma-shipment-type-catalog.adapter';
import { PrismaZoneCatalogAdapter } from '../infrastructure/prisma-zone-catalog.adapter';
import { ZonesModule } from '../zones.module';

describe('ZonesModule', () => {
  it('exposes the zone, sector, and shipment type application services and persistence adapters', async () => {
    const testingModule = await Test.createTestingModule({
      imports: [ZonesModule],
    }).compile();

    const createZoneService = testingModule.get(CreateZoneService);
    const listZonesService = testingModule.get(ListZonesService);
    const findZoneService = testingModule.get(FindZoneService);
    const zoneAdapter = testingModule.get(PrismaZoneCatalogAdapter);

    const createSectorService = testingModule.get(CreateSectorService);
    const listSectorsService = testingModule.get(ListSectorsByZoneService);
    const findSectorService = testingModule.get(FindSectorService);
    const sectorAdapter = testingModule.get(PrismaSectorCatalogAdapter);

    const createShipmentTypeService = testingModule.get(
      CreateShipmentTypeService,
    );
    const listShipmentTypesService = testingModule.get(
      ListShipmentTypesService,
    );
    const findShipmentTypeService = testingModule.get(FindShipmentTypeService);
    const shipmentTypeAdapter = testingModule.get(
      PrismaShipmentTypeCatalogAdapter,
    );

    expect(createZoneService).toBeInstanceOf(CreateZoneService);
    expect(listZonesService).toBeInstanceOf(ListZonesService);
    expect(findZoneService).toBeInstanceOf(FindZoneService);
    expect(zoneAdapter).toBeInstanceOf(PrismaZoneCatalogAdapter);

    expect(createSectorService).toBeInstanceOf(CreateSectorService);
    expect(listSectorsService).toBeInstanceOf(ListSectorsByZoneService);
    expect(findSectorService).toBeInstanceOf(FindSectorService);
    expect(sectorAdapter).toBeInstanceOf(PrismaSectorCatalogAdapter);

    expect(createShipmentTypeService).toBeInstanceOf(CreateShipmentTypeService);
    expect(listShipmentTypesService).toBeInstanceOf(ListShipmentTypesService);
    expect(findShipmentTypeService).toBeInstanceOf(FindShipmentTypeService);
    expect(shipmentTypeAdapter).toBeInstanceOf(
      PrismaShipmentTypeCatalogAdapter,
    );

    await testingModule.close();
  });
});
