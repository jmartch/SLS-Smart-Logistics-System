import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { CreateZoneService } from './application/create-zone.service';
import { FindZoneService } from './application/find-zone.service';
import { ListZonesService } from './application/list-zones.service';
import { PrismaZoneCatalogAdapter } from './infrastructure/prisma-zone-catalog.adapter';

@Module({
  imports: [PrismaModule],
  providers: [
    PrismaZoneCatalogAdapter,
    {
      provide: CreateZoneService,
      useFactory: (catalog: PrismaZoneCatalogAdapter) =>
        new CreateZoneService(catalog),
      inject: [PrismaZoneCatalogAdapter],
    },
    {
      provide: ListZonesService,
      useFactory: (catalog: PrismaZoneCatalogAdapter) =>
        new ListZonesService(catalog),
      inject: [PrismaZoneCatalogAdapter],
    },
    {
      provide: FindZoneService,
      useFactory: (catalog: PrismaZoneCatalogAdapter) =>
        new FindZoneService(catalog),
      inject: [PrismaZoneCatalogAdapter],
    },
  ],
  exports: [
    CreateZoneService,
    ListZonesService,
    FindZoneService,
    PrismaZoneCatalogAdapter,
  ],
})
export class ZonesModule {}
