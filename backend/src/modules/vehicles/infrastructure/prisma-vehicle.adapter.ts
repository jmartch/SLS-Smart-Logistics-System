import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { runWithTenant } from '../../../database/run-with-tenant';
import type {
  CreateVehicleData,
  CreateVehicleResult,
  VehicleRepositoryPort,
} from '../application/ports/vehicle-repository.port';

@Injectable()
export class PrismaVehicleAdapter implements VehicleRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async createByTenant(
    tenantId: string,
    data: CreateVehicleData,
  ): Promise<CreateVehicleResult> {
    try {
      const created = await runWithTenant(this.prisma, tenantId, async (tx) => {
        return tx.vehicle.create({
          data: {
            tenantId,
            plate: data.plate,
            maxWeightKg: data.maxWeightKg,
            maxVolumeM3: data.maxVolumeM3,
          },
          select: {
            id: true,
            tenantId: true,
            plate: true,
            maxWeightKg: true,
            maxVolumeM3: true,
            status: true,
          },
        });
      });

      return {
        ok: true,
        vehicle: {
          id: created.id,
          tenantId: created.tenantId,
          plate: created.plate,
          maxWeightKg: String(created.maxWeightKg),
          maxVolumeM3: String(created.maxVolumeM3),
          status: created.status,
        },
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return { ok: false, code: 'VEHICLE_PLATE_CONFLICT' };
      }

      throw error;
    }
  }
}
