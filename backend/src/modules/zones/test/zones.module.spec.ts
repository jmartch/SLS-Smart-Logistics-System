import { Test } from '@nestjs/testing';
import { CreateZoneService } from '../application/create-zone.service';
import { FindZoneService } from '../application/find-zone.service';
import { ListZonesService } from '../application/list-zones.service';
import { PrismaZoneCatalogAdapter } from '../infrastructure/prisma-zone-catalog.adapter';
import { ZonesModule } from '../zones.module';

describe('ZonesModule', () => {
  it('exposes the zone application services and persistence adapter', async () => {
    const testingModule = await Test.createTestingModule({
      imports: [ZonesModule],
    }).compile();

    const createService = testingModule.get(CreateZoneService);
    const listService = testingModule.get(ListZonesService);
    const findService = testingModule.get(FindZoneService);
    const adapter = testingModule.get(PrismaZoneCatalogAdapter);

    expect(createService).toBeInstanceOf(CreateZoneService);
    expect(listService).toBeInstanceOf(ListZonesService);
    expect(findService).toBeInstanceOf(FindZoneService);
    expect(adapter).toBeInstanceOf(PrismaZoneCatalogAdapter);

    await testingModule.close();
  });
});
