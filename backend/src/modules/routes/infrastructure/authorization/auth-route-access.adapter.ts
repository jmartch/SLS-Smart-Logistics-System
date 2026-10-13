import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service';
import { runWithTenant } from '../../../../database/run-with-tenant';
import { RouteAccessPort } from '../../application/ports/route-access.port';

@Injectable()
export class AuthRouteAccessAdapter implements RouteAccessPort {
  constructor(private readonly prisma: PrismaService) {}

  async getCourierIdForUser(
    tenantId: string,
    userId: string,
  ): Promise<string | null> {
    return runWithTenant(this.prisma, tenantId, async (client) => {
      const courier = await client.courier.findFirst({
        where: {
          tenantId,
          userId,
          status: 'ACTIVE',
        },
        select: { id: true },
      });

      return courier?.id ?? null;
    });
  }

  async canPrepareRoute(
    tenantId: string,
    actorUserId: string,
  ): Promise<boolean> {
    return this.isUserActiveInTenant(tenantId, actorUserId);
  }

  async canStartRoute(
    tenantId: string,
    actorUserId: string,
    routeCourierId: string,
  ): Promise<boolean> {
    const courierId = await this.getCourierIdForUser(tenantId, actorUserId);
    if (courierId && courierId === routeCourierId) {
      return true;
    }

    // Also check if user has coordinator/admin privileges
    return this.hasCoordinatorRole(tenantId, actorUserId);
  }

  async canCancelRoute(
    tenantId: string,
    actorUserId: string,
  ): Promise<boolean> {
    return this.isUserActiveInTenant(tenantId, actorUserId);
  }

  async canInterruptRoute(
    tenantId: string,
    actorUserId: string,
    routeCourierId: string,
  ): Promise<boolean> {
    const courierId = await this.getCourierIdForUser(tenantId, actorUserId);
    if (courierId && courierId === routeCourierId) {
      return true;
    }

    return this.hasCoordinatorRole(tenantId, actorUserId);
  }

  async canViewRoute(
    tenantId: string,
    actorUserId: string,
    routeCourierId: string,
  ): Promise<boolean> {
    const courierId = await this.getCourierIdForUser(tenantId, actorUserId);
    if (courierId) {
      return courierId === routeCourierId;
    }

    return this.isUserActiveInTenant(tenantId, actorUserId);
  }

  async canCloseRoute(
    tenantId: string,
    actorUserId: string,
    _mode: any,
  ): Promise<boolean> {
    return this.hasCoordinatorRole(tenantId, actorUserId);
  }

  async canReceiveDepotCargo(
    tenantId: string,
    actorUserId: string,
  ): Promise<boolean> {
    return this.isUserActiveInTenant(tenantId, actorUserId);
  }

  async canViewRouteSummary(
    tenantId: string,
    actorUserId: string,
    routeCourierId: string,
  ): Promise<boolean> {
    const courierId = await this.getCourierIdForUser(tenantId, actorUserId);
    if (courierId) {
      return courierId === routeCourierId;
    }

    return this.isUserActiveInTenant(tenantId, actorUserId);
  }

  private async isUserActiveInTenant(
    tenantId: string,
    userId: string,
  ): Promise<boolean> {
    return runWithTenant(this.prisma, tenantId, async (client) => {
      const user = await client.user.findFirst({
        where: {
          id: userId,
          tenantId,
          status: 'ACTIVE',
        },
        select: { id: true },
      });

      return !!user;
    });
  }

  private async hasCoordinatorRole(
    tenantId: string,
    userId: string,
  ): Promise<boolean> {
    return runWithTenant(this.prisma, tenantId, async (client) => {
      const userRole = await client.userRole.findFirst({
        where: {
          tenantId,
          userId,
          OR: [
            {
              role: {
                name: { in: ['COORDINATOR', 'ADMIN', 'SUPERADMIN'] },
              },
            },
            {
              role: {
                rolePermissions: {
                  some: {
                    permission: {
                      code: { in: ['COORDINATE_ROUTES', 'MANAGE_TENANT'] },
                    },
                  },
                },
              },
            },
          ],
        },
        select: { roleId: true },
      });

      if (userRole) {
        return true;
      }

      // An active tenant user who is not registered as a courier
      // functions as an operational coordinator in logistics flows
      const courier = await client.courier.findFirst({
        where: { tenantId, userId },
        select: { id: true },
      });

      return !courier;
    });
  }
}
