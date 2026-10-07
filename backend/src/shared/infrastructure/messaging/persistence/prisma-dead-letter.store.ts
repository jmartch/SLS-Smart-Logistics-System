import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../../generated/prisma/client';
import { PrismaService } from '../../../../database/prisma.service';
import { runWithTenant } from '../../../../database/run-with-tenant';
import type {
  DeadLetterRecord,
  DeadLetterStorePort,
} from '../../../application/messaging/ports/dead-letter-store.port';

@Injectable()
export class PrismaDeadLetterStore implements DeadLetterStorePort {
  constructor(private readonly prisma: PrismaService) {}

  async recordFailure(record: DeadLetterRecord): Promise<void> {
    await runWithTenant(this.prisma, record.tenantId, async (tx) => {
      await tx.deadLetterMessage.upsert({
        where: {
          failureKey: record.failureKey,
        },
        create: {
          tenantId: record.tenantId,
          eventId: record.eventId,
          correlationId: record.correlationId ?? null,
          sourceQueue: record.sourceQueue,
          consumerName: record.consumerName,
          attempts: record.attempts,
          originalEvent: record.originalEvent as Prisma.InputJsonValue,
          failureReason: record.failureReason,
          failedAt: record.failedAt ?? new Date(),
          failureKey: record.failureKey,
          transportMetadata: (record.transportMetadata ??
            null) as Prisma.InputJsonValue,
        },
        update: {},
      });
    });
  }

  async findById(
    tenantId: string,
    id: string,
  ): Promise<DeadLetterRecord | null> {
    return runWithTenant(this.prisma, tenantId, async (tx) => {
      const row = await tx.deadLetterMessage.findUnique({
        where: {
          tenantId_id: {
            tenantId,
            id,
          },
        },
      });

      if (!row) return null;

      return {
        id: row.id,
        tenantId: row.tenantId,
        eventId: row.eventId,
        correlationId: row.correlationId,
        sourceQueue: row.sourceQueue,
        consumerName: row.consumerName,
        attempts: row.attempts,
        originalEvent: row.originalEvent,
        failureReason: row.failureReason,
        failedAt: row.failedAt,
        failureKey: row.failureKey,
        transportMetadata: row.transportMetadata,
      };
    });
  }
}
