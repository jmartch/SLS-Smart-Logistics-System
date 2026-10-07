import type { Prisma } from '../../../../generated/prisma/client';
import type {
  AuditLogEntry,
  AuditWriterPort,
} from '../application/ports/audit-writer.port';

export class PrismaAuditWriter implements AuditWriterPort {
  constructor(private readonly tx: Prisma.TransactionClient) {}

  async recordAudit(entry: AuditLogEntry): Promise<void> {
    await this.tx.auditLog.create({
      data: {
        tenantId: entry.tenantId,
        actorUserId: entry.actorUserId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        correlationId: entry.correlationId ?? null,
        metadata: (entry.metadata ?? {}) as Prisma.InputJsonValue,
        createdAt: entry.createdAt ?? new Date(),
      },
    });
  }
}
