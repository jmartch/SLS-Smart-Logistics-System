import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service';
import { runWithTenant } from '../../../../database/run-with-tenant';
import type { DeliveryAccessPort } from '../../application/ports/delivery-access.port';

@Injectable()
export class AuthDeliveryAccessAdapter implements DeliveryAccessPort {
  constructor(private readonly prisma: PrismaService) {}

  async getCourierIdForUser(
    tenantId: string,
    actorUserId: string,
  ): Promise<string | null> {
    return runWithTenant(this.prisma, tenantId, async (client) => {
      const courier = await client.courier.findFirst({
        where: {
          tenantId,
          userId: actorUserId,
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      return courier?.id ?? null;
    });
  }

  async canAttendStop(
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

  async canRecordAttempt(
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

  async canReschedule(tenantId: string, actorUserId: string): Promise<boolean> {
    return this.hasCoordinatorRole(tenantId, actorUserId);
  }

  async canRequestReturn(
    tenantId: string,
    actorUserId: string,
  ): Promise<boolean> {
    return this.hasCoordinatorRole(tenantId, actorUserId);
  }

  async canReceiveAtDepot(
    tenantId: string,
    actorUserId: string,
  ): Promise<boolean> {
    return this.isUserActiveInTenant(tenantId, actorUserId);
  }

  async canReportIncident(
    tenantId: string,
    actorUserId: string,
    routeCourierId?: string,
  ): Promise<boolean> {
    if (routeCourierId) {
      const courierId = await this.getCourierIdForUser(tenantId, actorUserId);
      if (courierId && courierId === routeCourierId) {
        return true;
      }
    }
    return this.isUserActiveInTenant(tenantId, actorUserId);
  }

  async canViewDeliveries(
    tenantId: string,
    actorUserId: string,
    routeCourierId?: string,
  ): Promise<boolean> {
    if (routeCourierId) {
      const courierId = await this.getCourierIdForUser(tenantId, actorUserId);
      if (courierId && courierId === routeCourierId) {
        return true;
      }
    }
    return this.isUserActiveInTenant(tenantId, actorUserId);
  }

  private async isUserActiveInTenant(
    tenantId: string,
    userId: string,
  ): Promise<boolean> {
    return runWithTenant(this.prisma, tenantId, async (client) => {
      const user = await client.user.findFirst({
        where: { id: userId, tenantId, status: 'ACTIVE' },
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
          role: { name: { in: ['COORDINATOR', 'ADMIN', 'SUPERADMIN'] } },
        },
        select: { roleId: true },
      });
      return !!userRole;
    });
  }
}
