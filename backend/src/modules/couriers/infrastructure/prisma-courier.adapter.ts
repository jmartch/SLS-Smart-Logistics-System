import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { runWithTenant } from '../../../database/run-with-tenant';
import { PrismaUserDirectoryAdapter } from '../../users/infrastructure/prisma-user-directory.adapter';
import {
  CourierManagementPort,
  type CourierContext,
  type CourierListQuery,
  type CourierSession,
} from '../application/ports/courier-management.port';
import {
  CourierAlreadyLinkedError,
  CourierConcurrencyError,
  CourierNotFoundError,
} from '../domain/courier-errors';
import type { CourierSnapshot } from '../domain/courier-management.policy';

@Injectable()
export class PrismaCourierAdapter extends CourierManagementPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: PrismaUserDirectoryAdapter,
  ) {
    super();
  }

  list(tenantId: string, query: CourierListQuery) {
    return runWithTenant(
      this.prisma,
      tenantId,
      async (tx) => {
        const ids = query.search
          ? await this.users.reader(tx, tenantId).searchIds(query.search)
          : undefined;
        const where = {
          tenantId,
          ...(query.status ? { status: query.status } : {}),
          ...(ids ? { userId: { in: ids } } : {}),
        };
        const rows = await tx.courier.findMany({
          where,
          select: { id: true },
          orderBy: [{ userId: 'asc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        });
        const items: CourierSnapshot[] = [];
        for (const row of rows) {
          const snapshot = await this.snapshot(tx, tenantId, row.id);
          if (snapshot) items.push(snapshot);
        }
        return { items, total: await tx.courier.count({ where }) };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  eligibleUsers(tenantId: string, query: CourierListQuery) {
    return runWithTenant(
      this.prisma,
      tenantId,
      async (tx) => {
        const linked = await tx.courier.findMany({
          where: { tenantId },
          select: { userId: true },
        });
        return this.users
          .reader(tx, tenantId)
          .eligible({ ...query, excludedIds: linked.map((row) => row.userId) });
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  find(tenantId: string, id: string) {
    return runWithTenant(
      this.prisma,
      tenantId,
      (tx) => this.snapshot(tx, tenantId, id),
      { isolationLevel: 'RepeatableRead' },
    );
  }

  async run<T>(
    context: CourierContext,
    operation: (session: CourierSession) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await runWithTenant(
          this.prisma,
          context.tenantId,
          async (tx) =>
            operation({
              findUserForUpdate: (id) =>
                this.users.reader(tx, context.tenantId).findById(id, true),
              create: (userId) =>
                tx.courier.create({
                  data: { tenantId: context.tenantId, userId },
                  select: {
                    id: true,
                    tenantId: true,
                    userId: true,
                    status: true,
                  },
                }),
              loadForUpdate: async (id) => {
                const rows = await tx.$queryRaw<
                  Array<{ id: string }>
                >`SELECT id FROM "Courier" WHERE "tenantId" = ${context.tenantId}::uuid AND id = ${id}::uuid FOR UPDATE`;
                return rows.length
                  ? this.snapshot(tx, context.tenantId, id, true)
                  : null;
              },
              saveStatus: async (id, status) => {
                const result = await tx.courier.updateMany({
                  where: { tenantId: context.tenantId, id },
                  data: { status },
                });
                if (result.count !== 1) throw new CourierNotFoundError();
              },
              audit: async (id, action, before, after) => {
                const fields = (value: { userId: string; status: string }) => ({
                  userId: value.userId,
                  status: value.status,
                });
                await tx.auditLog.create({
                  data: {
                    tenantId: context.tenantId,
                    actorUserId: context.actorUserId,
                    correlationId: context.correlationId,
                    entityType: 'Courier',
                    entityId: id,
                    action,
                    metadata: {
                      before: before ? fields(before) : null,
                      after: fields(after),
                    },
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
          throw new CourierAlreadyLinkedError();
        const code = (error as { code?: string } | null)?.code;
        const retryable =
          code === 'P2034' ||
          code === '40001' ||
          code === '40P01' ||
          (error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2010' &&
            (error.meta?.code === '40001' || error.meta?.code === '40P01'));
        if (!retryable) throw error;
        if (attempt >= 2) throw new CourierConcurrencyError();
      }
    }
  }

  private async snapshot(
    tx: Prisma.TransactionClient,
    tenantId: string,
    id: string,
    lockUser = false,
  ): Promise<CourierSnapshot | null> {
    const courier = await tx.courier.findFirst({
      where: { tenantId, id },
      select: { id: true, tenantId: true, userId: true, status: true },
    });
    if (!courier) return null;
    const user = await this.users
      .reader(tx, tenantId)
      .findById(courier.userId, lockUser);
    if (!user) return null;
    const activeAssignmentCount = await tx.assignment.count({
      where: { tenantId, courierId: id, status: 'ACTIVE' },
    });
    const routes = await tx.route.findMany({
      where: { tenantId, courierId: id },
      select: { id: true, state: true },
      orderBy: { id: 'asc' },
    });
    return {
      ...courier,
      email: user.email,
      userStatus: user.status,
      activeAssignmentCount,
      routes,
    };
  }
}
