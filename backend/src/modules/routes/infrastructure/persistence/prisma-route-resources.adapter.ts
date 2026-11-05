import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service';
import { runWithTenant } from '../../../../database/run-with-tenant';
import { RouteState } from '../../../../../generated/prisma/client';
import {
  RouteResourceValidationResult,
  RouteResourcesPort,
  DepotResourceSnapshot,
} from '../../application/ports/route-resources.port';

@Injectable()
export class PrismaRouteResourcesAdapter implements RouteResourcesPort {
  constructor(private readonly prisma: PrismaService) {}

  async validateResourcesForRoute(
    tenantId: string,
    routeId: string,
    vehicleId: string,
    courierId: string,
    depotId?: string | null,
    _windowStart?: Date | null,
    _windowEnd?: Date | null,
  ): Promise<RouteResourceValidationResult> {
    void _windowStart;
    void _windowEnd;
    return runWithTenant(this.prisma, tenantId, async (client) => {
      // 1. Verify Vehicle
      const vehicle = await client.vehicle.findUnique({
        where: {
          tenantId_id: {
            tenantId,
            id: vehicleId,
          },
        },
      });

      if (!vehicle) {
        return {
          isValid: false,
          reason: `Vehicle "${vehicleId}" not found for tenant`,
        };
      }

      if (vehicle.status !== 'ACTIVE') {
        return {
          isValid: false,
          reason: `Vehicle "${vehicleId}" is not ACTIVE (status: ${vehicle.status})`,
        };
      }

      // 2. Verify Courier
      const courier = await client.courier.findUnique({
        where: {
          tenantId_id: {
            tenantId,
            id: courierId,
          },
        },
      });

      if (!courier) {
        return {
          isValid: false,
          reason: `Courier "${courierId}" not found for tenant`,
        };
      }

      if (courier.status !== 'ACTIVE') {
        return {
          isValid: false,
          reason: `Courier "${courierId}" is not ACTIVE (status: ${courier.status})`,
        };
      }

      // 3. Verify Depot (if specified)
      let depotSnapshot: DepotResourceSnapshot | undefined;
      if (depotId) {
        const depot = await client.depot.findUnique({
          where: {
            tenantId_id: {
              tenantId,
              id: depotId,
            },
          },
        });

        if (!depot) {
          return {
            isValid: false,
            reason: `Depot "${depotId}" not found for tenant`,
          };
        }

        depotSnapshot = {
          id: depot.id,
          tenantId: depot.tenantId,
          name: depot.name,
        };
      }

      // 4. Verify no conflicting active route currently occupies vehicle or courier
      const occupiedRoute = await client.route.findFirst({
        where: {
          tenantId,
          id: { not: routeId },
          state: { in: [RouteState.IN_PROGRESS, RouteState.INTERRUPTED] },
          OR: [{ vehicleId }, { courierId }],
        },
        select: {
          id: true,
          vehicleId: true,
          courierId: true,
        },
      });

      if (occupiedRoute) {
        const conflict =
          occupiedRoute.vehicleId === vehicleId ? 'Vehicle' : 'Courier';
        return {
          isValid: false,
          reason: `${conflict} is already occupied by active route "${occupiedRoute.id}"`,
        };
      }

      return {
        isValid: true,
        vehicle: {
          id: vehicle.id,
          tenantId: vehicle.tenantId,
          plate: vehicle.plate,
          status: vehicle.status,
          maxWeightKg: Number(vehicle.maxWeightKg),
          maxVolumeM3: Number(vehicle.maxVolumeM3),
        },
        courier: {
          id: courier.id,
          tenantId: courier.tenantId,
          userId: courier.userId,
          status: courier.status,
        },
        depot: depotSnapshot,
      };
    });
  }
}
