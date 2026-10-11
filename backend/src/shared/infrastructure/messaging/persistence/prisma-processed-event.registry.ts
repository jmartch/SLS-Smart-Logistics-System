import type { Prisma } from '../../../../../generated/prisma/client';
import type { ProcessingIdentity } from '../../../application/messaging/event-envelope';
import type { ProcessedEventRegistry } from '../../../application/messaging/ports/consumer-unit-of-work.port';

export type PrismaDbClient = {
  $queryRaw: Prisma.TransactionClient['$queryRaw'];
};

export class PrismaProcessedEventRegistry implements ProcessedEventRegistry {
  constructor(
    private readonly db: Prisma.TransactionClient | PrismaDbClient,
  ) {}

  async tryRegister(identity: ProcessingIdentity): Promise<boolean> {
    const rows = await this.db.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "ProcessedEvent"
        ("id", "tenantId", "eventId", "consumerName", "processedAt")
      VALUES (gen_random_uuid(), ${identity.tenantId}::uuid, ${identity.eventId}::uuid, ${identity.consumerName}, now())
      ON CONFLICT ("tenantId", "eventId", "consumerName") DO NOTHING
      RETURNING "id"
    `;

    return rows.length > 0;
  }

  async isProcessed(identity: ProcessingIdentity): Promise<boolean> {
    const rows = await this.db.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "ProcessedEvent"
      WHERE "tenantId" = ${identity.tenantId}::uuid
        AND "eventId" = ${identity.eventId}::uuid
        AND "consumerName" = ${identity.consumerName}
      LIMIT 1
    `;

    return rows.length > 0;
  }
}
