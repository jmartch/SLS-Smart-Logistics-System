import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { SectorCatalogService } from './application/sector-catalog.service';
import { ShipmentTypeCatalogService } from './application/shipment-type-catalog.service';
import { ZoneCatalogService } from './application/zone-catalog.service';
import { PrismaSectorCatalogAdapter } from './infrastructure/prisma-sector-catalog.adapter';
import { PrismaShipmentTypeCatalogAdapter } from './infrastructure/prisma-shipment-type-catalog.adapter';
import { PrismaZoneCatalogAdapter } from './infrastructure/prisma-zone-catalog.adapter';
import { ZonesController } from './presentation/zones.controller';
import { ShipmentTypesController } from './presentation/shipment-types.controller';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ZonesController, ShipmentTypesController],
  providers: [
    PrismaZoneCatalogAdapter,
    PrismaSectorCatalogAdapter,
    PrismaShipmentTypeCatalogAdapter,
    {
      provide: ZoneCatalogService,
      useFactory: (catalog: PrismaZoneCatalogAdapter) =>
        new ZoneCatalogService(catalog),
      inject: [PrismaZoneCatalogAdapter],
    },
    {
      provide: SectorCatalogService,
      useFactory: (catalog: PrismaSectorCatalogAdapter) =>
        new SectorCatalogService(catalog),
      inject: [PrismaSectorCatalogAdapter],
    },
    {
      provide: ShipmentTypeCatalogService,
      useFactory: (catalog: PrismaShipmentTypeCatalogAdapter) =>
        new ShipmentTypeCatalogService(catalog),
      inject: [PrismaShipmentTypeCatalogAdapter],
    },
  ],
  exports: [
    ZoneCatalogService,
    SectorCatalogService,
    ShipmentTypeCatalogService,
    PrismaZoneCatalogAdapter,
    PrismaSectorCatalogAdapter,
    PrismaShipmentTypeCatalogAdapter,
  ],
})
export class ZonesModule { }
