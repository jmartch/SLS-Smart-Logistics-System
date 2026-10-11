import { Injectable, Optional } from '@nestjs/common';
import { Prisma } from '../../../../../generated/prisma/client';
import { PrismaService } from '../../../../database/prisma.service';
import { runWithTenant } from '../../../../database/run-with-tenant';
import {
  ListRoutesRepositoryFilter,
  RouteRepository,
  RouteSummaryProjection,
} from '../../domain/route.repository';
import { Route } from '../../domain/route';
import { RoutePersistenceMapper } from './route-persistence.mapper';

@Injectable()
export class PrismaRouteRepository implements RouteRepository {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly tx?: Prisma.TransactionClient,
  ) {}

  async findById(tenantId: string, id: string): Promise<Route | null> {
    const execute = async (
      client: Prisma.TransactionClient | PrismaService,
    ) => {
      const raw = await client.route.findUnique({
        where: {
          tenantId_id: {
            tenantId,
            id,
          },
        },
        include: {
          stops: {
            orderBy: { sequence: 'asc' },
          },
        },
      });

      if (!raw) {
        return null;
      }

      return RoutePersistenceMapper.toDomain(raw);
    };

    if (this.tx) {
      return execute(this.tx);
    }

    return runWithTenant(this.prisma, tenantId, (tx) => execute(tx));
  }

  async save(route: Route): Promise<void> {
    const execute = async (
      client: Prisma.TransactionClient | PrismaService,
    ) => {
      await client.route.upsert({
        where: {
          tenantId_id: {
            tenantId: route.tenantId,
            id: route.id,
          },
        },
        create: RoutePersistenceMapper.toRouteCreateInput(route),
        update: RoutePersistenceMapper.toRouteUpdateInput(route),
      });

      for (const stop of route.stops) {
        await client.routeStop.upsert({
          where: {
            tenantId_id: {
              tenantId: stop.tenantId,
              id: stop.id,
            },
          },
          create: RoutePersistenceMapper.toStopCreateInput(stop),
          update: RoutePersistenceMapper.toStopUpdateInput(stop),
        });
      }
    };

    if (this.tx) {
      return execute(this.tx);
    }

    return runWithTenant(this.prisma, route.tenantId, (tx) => execute(tx));
  }

  async findMany(
    tenantId: string,
    filter: ListRoutesRepositoryFilter,
  ): Promise<{ items: readonly RouteSummaryProjection[]; total: number }> {
    const execute = async (
      client: Prisma.TransactionClient | PrismaService,
    ) => {
      const where: Prisma.RouteWhereInput = {
        tenantId,
        ...(filter.state ? { state: filter.state } : {}),
        ...(filter.courierId ? { courierId: filter.courierId } : {}),
      };

      if (filter.from || filter.to) {
        where.plannedAt = {
          ...(filter.from ? { gte: filter.from } : {}),
          ...(filter.to ? { lte: filter.to } : {}),
        };
      }

      if (filter.zoneId) {
        where.planningRequest = {
          parameters: {
            path: ['zoneId'],
            equals: filter.zoneId,
          },
        };
      }

      const skip = (filter.page - 1) * filter.pageSize;
      const take = filter.pageSize;

      const [total, records] = await Promise.all([
        client.route.count({ where }),
        client.route.findMany({
          where,
          skip,
          take,
          orderBy: { plannedAt: 'desc' },
          include: {
            planningRequest: {
              select: {
                parameters: true,
              },
            },
            _count: {
              select: {
                stops: true,
              },
            },
          },
        }),
      ]);

      const items: RouteSummaryProjection[] = records.map((r) => {
        const params = r.planningRequest?.parameters as
          Record<string, unknown> | null | undefined;
        const zoneId =
          typeof params?.zoneId === 'string' ? params.zoneId : null;

        return {
          id: r.id,
          tenantId: r.tenantId,
          state: r.state,
          vehicleId: r.vehicleId,
          courierId: r.courierId,
          depotId: r.depotId,
          zoneId,
          plannedStartAt: r.plannedStartAt,
          plannedEndAt: r.plannedEndAt,
          startedAt: r.startedAt,
          completedAt: r.completedAt,
          stopCount: r._count?.stops ?? 0,
        };
      });

      return { items, total };
    };

    if (this.tx) {
      return execute(this.tx);
    }

    return runWithTenant(this.prisma, tenantId, (tx) => execute(tx));
  }
}
