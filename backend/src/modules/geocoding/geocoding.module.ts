import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { GeocodeAddressService } from './application/geocode-address.service';
import { PrismaGeocodingAddress } from './infrastructure/prisma-geocoding-address';
import { PrismaGeocodingAttempt } from './infrastructure/prisma-geocoding-attempt';
import { PrismaGeocodingCatalog } from './infrastructure/prisma-geocoding-catalog';
import { PrismaNetworkAttachmentAdapter } from './infrastructure/prisma-network-attachment.adapter';

@Module({
  imports: [PrismaModule],
  providers: [
    PrismaGeocodingAddress,
    PrismaGeocodingCatalog,
    PrismaGeocodingAttempt,
    PrismaNetworkAttachmentAdapter,
    {
      provide: GeocodeAddressService,
      useFactory: (
        addresses: PrismaGeocodingAddress,
        catalog: PrismaGeocodingCatalog,
        attempts: PrismaGeocodingAttempt,
      ) => new GeocodeAddressService(addresses, catalog, attempts),
      inject: [
        PrismaGeocodingAddress,
        PrismaGeocodingCatalog,
        PrismaGeocodingAttempt,
      ],
    },
  ],
  exports: [
    GeocodeAddressService,
    PrismaGeocodingAddress,
    PrismaGeocodingCatalog,
    PrismaGeocodingAttempt,
    PrismaNetworkAttachmentAdapter,
  ],
})
export class GeocodingModule {}
