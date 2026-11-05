import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { runWithTenant } from '../../../database/run-with-tenant';
import type {
  CreateZoneData,
  CreateZoneResult,
  ZoneCatalogEntry,
  ZoneCatalogPort,
} from '../application/ports/zone-catalog.port';

@Injectable()
export class PrismaZoneCatalogAdapter implements ZoneCatalogPort {
  constructor(private readonly prisma: PrismaService) {}

  async listByTenant(tenantId: string): Promise<readonly ZoneCatalogEntry[]> {
    return runWithTenant(this.prisma, tenantId, async (tx) => {
      const records = await tx.zone.findMany({
        where: { tenantId },
        orderBy: [{ code: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          tenantId: true,
          code: true,
          name: true,
        },
      });

      return records;
    });
  }

  async findByTenant(
    tenantId: string,
    zoneId: string,
  ): Promise<ZoneCatalogEntry | null> {
    return runWithTenant(this.prisma, tenantId, async (tx) => {
      const record = await tx.zone.findUnique({
        where: {
          tenantId_id: {
            tenantId,
            id: zoneId,
          },
        },
        select: {
          id: true,
          tenantId: true,
          code: true,
          name: true,
        },
      });

      return record;
    });
  }

  async createByTenant(
    tenantId: string,
    data: CreateZoneData,
  ): Promise<CreateZoneResult> {
    try {
      const created = await runWithTenant(this.prisma, tenantId, async (tx) => {
        return tx.zone.create({
          data: {
            tenantId,
            code: data.code,
            name: data.name,
          },
          select: {
            id: true,
            tenantId: true,
            code: true,
            name: true,
          },
        });
      });

      return {
        ok: true,
        zone: created,
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
