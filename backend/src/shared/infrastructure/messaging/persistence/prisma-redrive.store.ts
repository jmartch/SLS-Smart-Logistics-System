import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service';
import { runWithTenant } from '../../../../database/run-with-tenant';
import { PrismaAuditWriter } from '../../../../modules/audit/infrastructure/prisma-audit-writer';
import type {
  CreateRedriveRequest,
  DeadLetterRedriveRecord,
  RedriveStorePort,
} from '../../../application/messaging/ports/redrive-store.port';

@Injectable()
export class PrismaRedriveStore implements RedriveStorePort {
  constructor(private readonly prisma: PrismaService) {}

  async createRequest(
    request: CreateRedriveRequest,
  ): Promise<DeadLetterRedriveRecord> {
    return runWithTenant(this.prisma, request.tenantId, async (tx) => {
      const redrive = await tx.deadLetterRedrive.create({
        data: {
          id: request.id,
          tenantId: request.tenantId,
          deadLetterMessageId: request.deadLetterMessageId,
          consumerName: request.consumerName,
          requestedBy: request.requestedBy,
          reason: request.reason,
          status: 'PENDING',
        },
      });

      const auditWriter = new PrismaAuditWriter(tx);
      await auditWriter.recordAudit({
        tenantId: request.tenantId,
        actorUserId: null,
        action: 'DEAD_LETTER_REDRIVE_REQUESTED',
        entityType: 'DEAD_LETTER_REDRIVE',
        entityId: request.id,
        metadata: {
          deadLetterMessageId: request.deadLetterMessageId,
          consumerName: request.consumerName,
          requestedBy: request.requestedBy,
          reason: request.reason,
        },
      });

      return {
        id: redrive.id,
        tenantId: redrive.tenantId,
        deadLetterMessageId: redrive.deadLetterMessageId,
        consumerName: redrive.consumerName,
        requestedBy: redrive.requestedBy,
        reason: redrive.reason,
        requestedAt: redrive.requestedAt,
        status: redrive.status,
        attempts: redrive.attempts,
        nextAttemptAt: redrive.nextAttemptAt,
        leaseToken: redrive.leaseToken,
        lockedUntil: redrive.lockedUntil,
        lastError: redrive.lastError,
        publishedAt: redrive.publishedAt,
      };
    });
  }

  async claimDue(
    tenantId: string,
    limit: number,
    leaseDurationMs: number,
  ): Promise<readonly DeadLetterRedriveRecord[]> {
    return runWithTenant(this.prisma, tenantId, async (tx) => {
      const candidates = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "DeadLetterRedrive"
        WHERE "tenantId" = ${tenantId}::uuid
          AND "status" = 'PENDING'
          AND "nextAttemptAt" <= now()
          AND ("lockedUntil" IS NULL OR "lockedUntil" <= now())
        ORDER BY "requestedAt", "id"
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      `;

      if (candidates.length === 0) {
        return [];
      }

      const leaseToken = randomUUID();
      const lockedUntil = new Date(Date.now() + leaseDurationMs);
      const candidateIds = candidates.map((c) => c.id);

      await tx.deadLetterRedrive.updateMany({
        where: {
          tenantId,
          id: { in: candidateIds },
          status: 'PENDING',
        },
        data: {
          leaseToken,
          lockedUntil,
          attempts: { increment: 1 },
        },
      });

      const rows = await tx.deadLetterRedrive.findMany({
        where: {
          tenantId,
          id: { in: candidateIds },
        },
        orderBy: [{ requestedAt: 'asc' }, { id: 'asc' }],
      });

      return rows.map((r) => ({
        id: r.id,
        tenantId: r.tenantId,
        deadLetterMessageId: r.deadLetterMessageId,
        consumerName: r.consumerName,
        requestedBy: r.requestedBy,
        reason: r.reason,
        requestedAt: r.requestedAt,
        status: r.status,
        attempts: r.attempts,
        nextAttemptAt: r.nextAttemptAt,
        leaseToken: r.leaseToken,
        lockedUntil: r.lockedUntil,
        lastError: r.lastError,
        publishedAt: r.publishedAt,
      }));
    });
  }

  async markPublished(
    tenantId: string,
    id: string,
    leaseToken: string,
    publishedAt?: Date,
  ): Promise<boolean> {
    return runWithTenant(this.prisma, tenantId, async (tx) => {
      const redrive = await tx.deadLetterRedrive.findUnique({
        where: { tenantId_id: { tenantId, id } },
      });

      if (
        !redrive ||
        redrive.leaseToken !== leaseToken ||
        redrive.status !== 'PENDING'
      ) {
        return false;
      }

      const now = publishedAt ?? new Date();

      await tx.deadLetterRedrive.update({
        where: { tenantId_id: { tenantId, id } },
        data: {
          status: 'PUBLISHED',
          publishedAt: now,
          leaseToken: null,
          lockedUntil: null,
          lastError: null,
        },
      });

      await tx.deadLetterMessage.update({
        where: { tenantId_id: { tenantId, id: redrive.deadLetterMessageId } },
        data: {
          redrivenAt: now,
        },
      });

      const auditWriter = new PrismaAuditWriter(tx);
      await auditWriter.recordAudit({
        tenantId,
        actorUserId: null,
        action: 'DEAD_LETTER_REDRIVE_PUBLISHED',
        entityType: 'DEAD_LETTER_REDRIVE',
        entityId: id,
        metadata: {
          deadLetterMessageId: redrive.deadLetterMessageId,
          consumerName: redrive.consumerName,
          publishedAt: now.toISOString(),
        },
      });

      return true;
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
      const updated = await tx.deadLetterRedrive.updateMany({
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
}
