import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { runWithTenant } from '../../../database/run-with-tenant';
import type {
  CreateShipmentTypeData,
  CreateShipmentTypeResult,
  ListShipmentTypesFilter,
  ShipmentTypeCatalogEntry,
  ShipmentTypeCatalogPort,
} from '../application/ports/shipment-type-catalog.port';

@Injectable()
export class PrismaShipmentTypeCatalogAdapter implements ShipmentTypeCatalogPort {
  constructor(private readonly prisma: PrismaService) {}

  async listByTenant(
    tenantId: string,
    filter?: ListShipmentTypesFilter,
  ): Promise<readonly ShipmentTypeCatalogEntry[]> {
    return runWithTenant(this.prisma, tenantId, async (tx) => {
      const where: { tenantId: string; active?: boolean } = { tenantId };

      if (!filter?.includeInactive) {
        where.active = true;
      }

      const records = await tx.shipmentType.findMany({
        where,
        orderBy: [{ code: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          tenantId: true,
          code: true,
          name: true,
          active: true,
        },
      });

      return records;
    });
  }

  async findByTenant(
    tenantId: string,
    id: string,
  ): Promise<ShipmentTypeCatalogEntry | null> {
    return runWithTenant(this.prisma, tenantId, async (tx) => {
      const record = await tx.shipmentType.findUnique({
        where: {
          tenantId_id: {
            tenantId,
            id,
          },
        },
        select: {
          id: true,
          tenantId: true,
          code: true,
          name: true,
          active: true,
        },
      });

      return record;
    });
  }

  async createByTenant(
    tenantId: string,
    data: CreateShipmentTypeData,
  ): Promise<CreateShipmentTypeResult> {
    try {
      const created = await runWithTenant(this.prisma, tenantId, async (tx) => {
        return tx.shipmentType.create({
          data: {
            tenantId,
            code: data.code,
            name: data.name,
            active: data.active ?? true,
          },
          select: {
            id: true,
            tenantId: true,
            code: true,
            name: true,
            active: true,
          },
        });
      });

      return {
        ok: true,
        shipmentType: created,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return {
          ok: false,
          code: 'CATALOG_CODE_CONFLICT',
        };
      }

      throw error;
    }
  }
}
