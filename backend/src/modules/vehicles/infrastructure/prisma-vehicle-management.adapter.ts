import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { runWithTenant } from '../../../database/run-with-tenant';
import {
  VehicleManagementPort,
  type VehicleManagementContext,
  type VehicleManagementSession,
} from '../application/ports/vehicle-management.port';
import type { VehicleSnapshot } from '../domain/vehicle-management.policy';
import {
  VehicleConcurrencyError,
  VehicleNotFoundError,
  VehiclePlateConflictError,
} from '../domain/vehicle-errors';

@Injectable()
export class PrismaVehicleManagementAdapter extends VehicleManagementPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  findByTenantAndId(tenantId: string, vehicleId: string) {
    return runWithTenant(
      this.prisma,
      tenantId,
      (tx) => this.snapshot(tx, tenantId, vehicleId),
      { isolationLevel: 'RepeatableRead' },
    );
  }

  async run<T>(
    context: VehicleManagementContext,
    operation: (session: VehicleManagementSession) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await runWithTenant(
          this.prisma,
          context.tenantId,
          async (tx) =>
            operation({
              loadForUpdate: async (vehicleId) => {
                const rows = await tx.$queryRaw<Array<{ id: string }>>`
              SELECT id FROM "Vehicle" WHERE "tenantId" = ${context.tenantId}::uuid AND id = ${vehicleId}::uuid FOR UPDATE
            `;
                return rows.length
                  ? this.snapshot(tx, context.tenantId, vehicleId)
                  : null;
              },
              save: async (vehicleId, changes) => {
                const result = await tx.vehicle.updateMany({
                  where: { tenantId: context.tenantId, id: vehicleId },
                  data: changes,
                });
                if (result.count !== 1) throw new VehicleNotFoundError();
              },
              audit: async (vehicleId, action, before, after) => {
                const fields = (value: VehicleSnapshot) => ({
                  plate: value.plate,
                  maxWeightKg: value.maxWeightKg,
                  maxVolumeM3: value.maxVolumeM3,
                  status: value.status,
                });
                await tx.auditLog.create({
                  data: {
                    tenantId: context.tenantId,
                    actorUserId: context.actorUserId,
                    correlationId: context.correlationId,
                    action,
                    entityType: 'Vehicle',
                    entityId: vehicleId,
                    metadata: { before: fields(before), after: fields(after) },
                  },
                });
              },
            }),
          { isolationLevel: 'Serializable' },
        );
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        )
          throw new VehiclePlateConflictError();
        const code = (error as { code?: string } | null)?.code;
        const retryable =
          code === 'P2034' ||
          code === '40001' ||
          code === '40P01' ||
          (error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2010' &&
            (error.meta?.code === '40001' || error.meta?.code === '40P01'));
        if (!retryable) throw error;
        if (attempt >= 2) throw new VehicleConcurrencyError();
      }
    }
  }

  private async snapshot(
    tx: Prisma.TransactionClient,
    tenantId: string,
    vehicleId: string,
  ): Promise<VehicleSnapshot | null> {
    const vehicle = await tx.vehicle.findFirst({
      where: { tenantId, id: vehicleId },
      select: {
        id: true,
        tenantId: true,
        plate: true,
        status: true,
        maxWeightKg: true,
        maxVolumeM3: true,
      },
    });
    if (!vehicle) return null;
    const [load] = await tx.$queryRaw<
      Array<{
        weightKg: Prisma.Decimal;
        volumeM3: Prisma.Decimal;
        count: bigint;
      }>
    >`
      SELECT COALESCE(SUM(p."weightKg"), 0) AS "weightKg", COALESCE(SUM(p."volumeM3"), 0) AS "volumeM3", COUNT(*) AS count
      FROM "Assignment" a JOIN "Package" p ON p.id = a."packageId" AND p."tenantId" = a."tenantId"
      WHERE a."tenantId" = ${tenantId}::uuid AND a."vehicleId" = ${vehicleId}::uuid AND a.status = 'ACTIVE'
    `;
    const routes = await tx.route.findMany({
      where: { tenantId, vehicleId },
      select: { state: true },
    });
    return {
      ...vehicle,
      maxWeightKg: vehicle.maxWeightKg.toFixed(3),
      maxVolumeM3: vehicle.maxVolumeM3.toFixed(6),
      assignedWeightKg: new Prisma.Decimal(load?.weightKg ?? 0).toFixed(3),
      assignedVolumeM3: new Prisma.Decimal(load?.volumeM3 ?? 0).toFixed(6),
      routeStates: routes.map((route) => route.state),
      activeAssignmentCount: Number(load?.count ?? 0n),
    };
  }
}
