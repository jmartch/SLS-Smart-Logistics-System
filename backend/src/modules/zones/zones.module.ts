import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { CreateSectorService } from './application/create-sector.service';
import { CreateShipmentTypeService } from './application/create-shipment-type.service';
import { CreateZoneService } from './application/create-zone.service';
import { FindSectorService } from './application/find-sector.service';
import { FindShipmentTypeService } from './application/find-shipment-type.service';
import { FindZoneService } from './application/find-zone.service';
import { ListSectorsByZoneService } from './application/list-sectors-by-zone.service';
import { ListShipmentTypesService } from './application/list-shipment-types.service';
import { ListZonesService } from './application/list-zones.service';
import { PrismaSectorCatalogAdapter } from './infrastructure/prisma-sector-catalog.adapter';
import { PrismaShipmentTypeCatalogAdapter } from './infrastructure/prisma-shipment-type-catalog.adapter';
import { PrismaZoneCatalogAdapter } from './infrastructure/prisma-zone-catalog.adapter';

@Module({
  imports: [PrismaModule],
  providers: [
    PrismaZoneCatalogAdapter,
    PrismaSectorCatalogAdapter,
    PrismaShipmentTypeCatalogAdapter,
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
    {
      provide: CreateSectorService,
      useFactory: (catalog: PrismaSectorCatalogAdapter) =>
        new CreateSectorService(catalog),
      inject: [PrismaSectorCatalogAdapter],
    },
    {
      provide: ListSectorsByZoneService,
      useFactory: (catalog: PrismaSectorCatalogAdapter) =>
        new ListSectorsByZoneService(catalog),
      inject: [PrismaSectorCatalogAdapter],
    },
    {
      provide: FindSectorService,
      useFactory: (catalog: PrismaSectorCatalogAdapter) =>
        new FindSectorService(catalog),
      inject: [PrismaSectorCatalogAdapter],
    },
    {
      provide: CreateShipmentTypeService,
      useFactory: (catalog: PrismaShipmentTypeCatalogAdapter) =>
        new CreateShipmentTypeService(catalog),
      inject: [PrismaShipmentTypeCatalogAdapter],
    },
    {
      provide: ListShipmentTypesService,
      useFactory: (catalog: PrismaShipmentTypeCatalogAdapter) =>
        new ListShipmentTypesService(catalog),
      inject: [PrismaShipmentTypeCatalogAdapter],
    },
    {
      provide: FindShipmentTypeService,
      useFactory: (catalog: PrismaShipmentTypeCatalogAdapter) =>
        new FindShipmentTypeService(catalog),
      inject: [PrismaShipmentTypeCatalogAdapter],
    },
  ],
  exports: [
    CreateZoneService,
    ListZonesService,
    FindZoneService,
    PrismaZoneCatalogAdapter,
    CreateSectorService,
    ListSectorsByZoneService,
    FindSectorService,
    PrismaSectorCatalogAdapter,
    CreateShipmentTypeService,
    ListShipmentTypesService,
    FindShipmentTypeService,
    PrismaShipmentTypeCatalogAdapter,
  ],
})
export class ZonesModule {}
