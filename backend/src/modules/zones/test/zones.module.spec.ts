import { Test } from '@nestjs/testing';
import { SectorCatalogService } from '../application/sector-catalog.service';
import { ShipmentTypeCatalogService } from '../application/shipment-type-catalog.service';
import { ZoneCatalogService } from '../application/zone-catalog.service';
import { PrismaSectorCatalogAdapter } from '../infrastructure/prisma-sector-catalog.adapter';
import { PrismaShipmentTypeCatalogAdapter } from '../infrastructure/prisma-shipment-type-catalog.adapter';
import { PrismaZoneCatalogAdapter } from '../infrastructure/prisma-zone-catalog.adapter';
import { ZonesModule } from '../zones.module';

describe('ZonesModule', () => {
  it('exposes the zone, sector, and shipment type application services and persistence adapters', async () => {
    const testingModule = await Test.createTestingModule({
      imports: [ZonesModule],
    }).compile();

    const zoneService = testingModule.get(ZoneCatalogService);
    const sectorService = testingModule.get(SectorCatalogService);
    const shipmentTypeService = testingModule.get(ShipmentTypeCatalogService);

    const zoneAdapter = testingModule.get(PrismaZoneCatalogAdapter);
    const sectorAdapter = testingModule.get(PrismaSectorCatalogAdapter);
    const shipmentTypeAdapter = testingModule.get(
      PrismaShipmentTypeCatalogAdapter,
    );

    expect(zoneService).toBeInstanceOf(ZoneCatalogService);
    expect(sectorService).toBeInstanceOf(SectorCatalogService);
    expect(shipmentTypeService).toBeInstanceOf(ShipmentTypeCatalogService);

    expect(zoneAdapter).toBeInstanceOf(PrismaZoneCatalogAdapter);
    expect(sectorAdapter).toBeInstanceOf(PrismaSectorCatalogAdapter);
    expect(shipmentTypeAdapter).toBeInstanceOf(
      PrismaShipmentTypeCatalogAdapter,
    );

    await testingModule.close();
  });
});
