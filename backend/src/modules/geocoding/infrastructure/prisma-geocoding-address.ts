import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import {
  FindGeocodingAddressQuery,
  GeocodingAddress,
  GeocodingAddressPort,
} from '../application/ports/geocoding-address.port';

@Injectable()
export class PrismaGeocodingAddress implements GeocodingAddressPort {
  constructor(private readonly prisma: PrismaService) {}

  async findByTenant(
    query: FindGeocodingAddressQuery,
  ): Promise<GeocodingAddress | null> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`
      SELECT set_config('app.tenant_id', ${query.tenantId}, true)
    `;

      return this.findByTenantInTx(transaction, query);
    });
  }

  async findByTenantInTx(
    client: Prisma.TransactionClient | PrismaService,
    query: FindGeocodingAddressQuery,
  ): Promise<GeocodingAddress | null> {
    return client.address.findFirst({
      where: {
        tenantId: query.tenantId,
        id: query.addressId,
      },
      select: {
        id: true,
        tenantId: true,
        originalText: true,
        municipalityCode: true,
      },
    });
  }
}
