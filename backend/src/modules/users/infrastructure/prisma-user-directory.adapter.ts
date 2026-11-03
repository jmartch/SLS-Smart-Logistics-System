import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client';
import type { UserDirectoryReader } from '../application/ports/user-directory.port';

/** Public persistence collaborator for workflows sharing a tenant transaction. */
@Injectable()
export class PrismaUserDirectoryAdapter {
  reader(tx: Prisma.TransactionClient, tenantId: string): UserDirectoryReader {
    const select = { id: true, email: true, status: true } as const;
    return {
      findById: async (userId, lock = false) => {
        if (lock) {
          await tx.$queryRaw`SELECT id FROM "User" WHERE "tenantId" = ${tenantId}::uuid AND id = ${userId}::uuid FOR SHARE`;
        }
        return tx.user.findFirst({ where: { tenantId, id: userId }, select });
      },
      searchIds: async (search) => {
        const rows = await tx.user.findMany({
          where: { tenantId, email: { contains: search, mode: 'insensitive' } },
          select: { id: true },
        });
        return rows.map((row) => row.id);
      },
      eligible: async (query) => {
        const where: Prisma.UserWhereInput = {
          tenantId,
          status: 'ACTIVE',
          id: { notIn: [...query.excludedIds] },
          ...(query.search
            ? { email: { contains: query.search, mode: 'insensitive' } }
            : {}),
        };
        const items = await tx.user.findMany({
          where,
          select,
          orderBy: [{ email: 'asc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        });
        return { items, total: await tx.user.count({ where }) };
      },
    };
  }
}
