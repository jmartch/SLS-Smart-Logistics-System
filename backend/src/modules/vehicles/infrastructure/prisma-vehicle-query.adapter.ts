import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { runWithTenant } from '../../../database/run-with-tenant';
import {
  VehicleQueryPort,
  type ListVehiclesQuery,
  type VehicleListItem,
  type VehicleListResult,
} from '../application/ports/vehicle-query.port';

@Injectable()
export class PrismaVehicleQueryAdapter extends VehicleQueryPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listByTenant(
    tenantId: string,
    query: ListVehiclesQuery,
  ): Promise<VehicleListResult> {
    return runWithTenant(
      this.prisma,
      tenantId,
      async (tx) => {
        const where: Prisma.VehicleWhereInput = {
          tenantId,
          ...(query.status ? { status: query.status } : {}),
          ...(query.search
            ? { plate: { contains: query.search, mode: 'insensitive' } }
            : {}),
        };
        const total = await tx.vehicle.count({ where });
        const vehicles = await tx.vehicle.findMany({
          where,
          orderBy: [{ plate: 'asc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          select: {
            id: true,
            tenantId: true,
            plate: true,
            status: true,
            maxWeightKg: true,
            maxVolumeM3: true,
          },
        });
        // Capacity is a read projection of active assignments, never a stored snapshot.
        const loads =
          vehicles.length === 0
            ? []
            : await tx.$queryRaw<
                Array<{
                  vehicleId: string;
                  weightKg: Prisma.Decimal;
                  volumeM3: Prisma.Decimal;
                }>
              >(Prisma.sql`
        SELECT a."vehicleId", SUM(p."weightKg") AS "weightKg", SUM(p."volumeM3") AS "volumeM3"
        FROM "Assignment" a
        JOIN "Package" p ON p.id = a."packageId" AND p."tenantId" = a."tenantId"
        WHERE a."tenantId" = ${tenantId}::uuid AND a.status = 'ACTIVE'
          AND a."vehicleId" IN (${Prisma.join(vehicles.map((v) => Prisma.sql`${v.id}::uuid`))})
        GROUP BY a."vehicleId"
      `);
        const byVehicle = new Map(loads.map((load) => [load.vehicleId, load]));
        const items: VehicleListItem[] = vehicles.map((vehicle) => {
          const load = byVehicle.get(vehicle.id);
          const weight = new Prisma.Decimal(load?.weightKg ?? 0);
          const volume = new Prisma.Decimal(load?.volumeM3 ?? 0);
          return {
            ...vehicle,
            maxWeightKg: vehicle.maxWeightKg.toFixed(3),
            maxVolumeM3: vehicle.maxVolumeM3.toFixed(6),
            assignedWeightKg: weight.toFixed(3),
            assignedVolumeM3: volume.toFixed(6),
            remainingWeightKg: vehicle.maxWeightKg.minus(weight).toFixed(3),
            remainingVolumeM3: vehicle.maxVolumeM3.minus(volume).toFixed(6),
          };
        });
        return { items, total, page: query.page, pageSize: query.pageSize };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
