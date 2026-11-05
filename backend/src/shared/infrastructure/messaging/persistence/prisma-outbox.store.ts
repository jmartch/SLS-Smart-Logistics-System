import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service';
import { runWithTenant } from '../../../../database/run-with-tenant';
import type {
  ClaimDueOptions,
  ClaimedOutboxRecord,
  OutboxStorePort,
} from '../../../application/messaging/ports/outbox-store.port';

@Injectable()
export class PrismaOutboxStore implements OutboxStorePort {
  constructor(private readonly prisma: PrismaService) {}

  async claimDue(
    options: ClaimDueOptions,
  ): Promise<readonly ClaimedOutboxRecord[]> {
    return runWithTenant(this.prisma, options.tenantId, async (tx) => {
      const candidates = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "OutboxEvent"
        WHERE "tenantId" = ${options.tenantId}::uuid
          AND "status" = 'PENDING'
          AND "nextAttemptAt" <= now()
          AND ("lockedUntil" IS NULL OR "lockedUntil" <= now())
        ORDER BY "occurredAt", "id"
        LIMIT ${options.limit}
        FOR UPDATE SKIP LOCKED
      `;

      if (candidates.length === 0) {
        return [];
      }

      const leaseToken = randomUUID();
      const lockedUntil = new Date(Date.now() + options.leaseDurationMs);
      const candidateIds = candidates.map((c) => c.id);

      await tx.outboxEvent.updateMany({
        where: {
          tenantId: options.tenantId,
          id: { in: candidateIds },
          status: 'PENDING',
        },
        data: {
          leaseToken,
          lockedUntil,
          attempts: { increment: 1 },
        },
      });

      const rows = await tx.outboxEvent.findMany({
        where: {
          tenantId: options.tenantId,
          id: { in: candidateIds },
        },
        orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      });

      return rows.map((r) => ({
        id: r.id,
        tenantId: r.tenantId,
        eventId: r.eventId,
        correlationId: r.correlationId,
        eventType: r.eventType,
        version: r.version,
        payload: r.payload,
        producer: r.producer,
        occurredAt: r.occurredAt,
        attempts: r.attempts,
        leaseToken: r.leaseToken ?? leaseToken,
      }));
    });
  }

  async renewLease(
    tenantId: string,
    id: string,
    leaseToken: string,
    extraMs: number,
  ): Promise<boolean> {
    return runWithTenant(this.prisma, tenantId, async (tx) => {
      const newLockedUntil = new Date(Date.now() + extraMs);
      const updated = await tx.outboxEvent.updateMany({
        where: {
          tenantId,
          id,
          leaseToken,
          status: 'PENDING',
        },
        data: {
          lockedUntil: newLockedUntil,
        },
      });

      return updated.count > 0;
    });
  }

  async markPublished(
    tenantId: string,
    id: string,
    leaseToken: string,
    publishedAt?: Date,
  ): Promise<boolean> {
    return runWithTenant(this.prisma, tenantId, async (tx) => {
      const updated = await tx.outboxEvent.updateMany({
        where: {
          tenantId,
          id,
          leaseToken,
          status: 'PENDING',
        },
        data: {
          status: 'PUBLISHED',
          publishedAt: publishedAt ?? new Date(),
          leaseToken: null,
          lockedUntil: null,
          lastError: null,
        },
      });

      return updated.count > 0;
    });
  }

  async failClaim(
    tenantId: string,
    id: string,
    leaseToken: string,
    error: string,
    nextAttemptAt?: Date,
  ): Promise<boolean> {
    return runWithTenant(this.prisma, tenantId, async (tx) => {
      const updated = await tx.outboxEvent.updateMany({
        where: {
          tenantId,
          id,
          leaseToken,
          status: 'PENDING',
        },
        data: {
          leaseToken: null,
          lockedUntil: null,
          lastError: error,
          nextAttemptAt: nextAttemptAt ?? new Date(),
        },
      });

      return updated.count > 0;
    });
  }

  async markFailedPermanently(
    tenantId: string,
    id: string,
    leaseToken: string,
    error: string,
  ): Promise<boolean> {
    return runWithTenant(this.prisma, tenantId, async (tx) => {
      const updated = await tx.outboxEvent.updateMany({
        where: {
          tenantId,
          id,
          leaseToken,
        },
        data: {
          status: 'FAILED',
          leaseToken: null,
          lockedUntil: null,
          lastError: error,
        },
      });

      return updated.count > 0;
    });
  }
}
