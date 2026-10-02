import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { runWithTenant } from '../../../database/run-with-tenant';
import type {
  CreateSectorData,
  CreateSectorResult,
  SectorCatalogEntry,
  SectorCatalogPort,
} from '../application/ports/sector-catalog.port';

@Injectable()
export class PrismaSectorCatalogAdapter implements SectorCatalogPort {
  constructor(private readonly prisma: PrismaService) {}

  async listByZone(
    tenantId: string,
    zoneId: string,
  ): Promise<readonly SectorCatalogEntry[]> {
    return runWithTenant(this.prisma, tenantId, async (tx) => {
      const records = await tx.sector.findMany({
        where: { tenantId, zoneId },
        orderBy: [{ code: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          tenantId: true,
          zoneId: true,
          code: true,
          name: true,
        },
      });

      return records;
    });
  }

  async findByTenant(
    tenantId: string,
    sectorId: string,
  ): Promise<SectorCatalogEntry | null> {
    return runWithTenant(this.prisma, tenantId, async (tx) => {
      const record = await tx.sector.findUnique({
        where: {
          tenantId_id: {
            tenantId,
            id: sectorId,
          },
        },
        select: {
          id: true,
          tenantId: true,
          zoneId: true,
          code: true,
          name: true,
        },
      });

      return record;
    });
  }

  async createByTenant(
    tenantId: string,
    data: CreateSectorData,
  ): Promise<CreateSectorResult> {
    try {
      return await runWithTenant(this.prisma, tenantId, async (tx) => {
        const parentZone = await tx.zone.findUnique({
          where: {
            tenantId_id: {
              tenantId,
              id: data.zoneId,
            },
          },
          select: { id: true },
        });

        if (!parentZone) {
          return {
            ok: false,
            code: 'ZONE_NOT_FOUND',
          };
        }

        const created = await tx.sector.create({
          data: {
            tenantId,
            zoneId: data.zoneId,
            code: data.code,
            name: data.name,
          },
          select: {
            id: true,
            tenantId: true,
            zoneId: true,
            code: true,
            name: true,
          },
        });

        return {
          ok: true,
          sector: created,
        };
      });
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
