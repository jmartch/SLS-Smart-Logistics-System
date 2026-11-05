import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { runWithTenant } from '../../../database/run-with-tenant';
import type { ConsumerUnitOfWork } from '../../../shared/application/messaging/ports/consumer-unit-of-work.port';
import { PrismaProcessedEventRegistry } from '../../../shared/infrastructure/messaging/persistence/prisma-processed-event.registry';
import { PrismaAuditWriter } from './prisma-audit-writer';
import type { AuditConsumerSession } from '../application/audit-consumer-session';

@Injectable()
export class PrismaAuditConsumerUnitOfWork implements ConsumerUnitOfWork<AuditConsumerSession> {
  constructor(private readonly prisma: PrismaService) {}

  async run<T>(
    tenantId: string,
    work: (session: AuditConsumerSession) => Promise<T>,
  ): Promise<T> {
    return runWithTenant(this.prisma, tenantId, async (tx) => {
      const processedEvents = new PrismaProcessedEventRegistry(tx);
      const auditWriter = new PrismaAuditWriter(tx);
      return work({ processedEvents, auditWriter });
    });
  }
}
