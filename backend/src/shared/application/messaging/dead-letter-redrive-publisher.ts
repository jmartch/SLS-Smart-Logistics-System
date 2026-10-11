import type { EventEnvelope } from './event-envelope';
import type {
  RedriveStorePort,
  DeadLetterRedriveRecord,
} from './ports/redrive-store.port';
import type {
  DeadLetterStorePort,
  DeadLetterRecord,
} from './ports/dead-letter-store.port';
import type { EventPublisherPort } from './ports/event-publisher.port';
import { OutboxEventMapper } from './outbox-event.mapper';

export interface RedrivePublisherOptions {
  readonly allowedTenantIds: readonly string[];
  readonly batchSize?: number;
  readonly leaseDurationMs?: number;
  readonly returnExchange?: string;
}

export class DeadLetterRedrivePublisher {
  private readonly batchSize: number;
  private readonly leaseDurationMs: number;
  private readonly returnExchange: string;

  constructor(
    private readonly redriveStore: RedriveStorePort,
    private readonly deadLetterStore: DeadLetterStorePort,
    private readonly publisher: EventPublisherPort,
    private readonly options: RedrivePublisherOptions,
  ) {
    this.batchSize = options.batchSize ?? 10;
    this.leaseDurationMs = options.leaseDurationMs ?? 60000;
    this.returnExchange = options.returnExchange ?? 'sls.return.v1';
  }

  async publishPendingRedrives(specificTenantId?: string): Promise<{
    claimed: number;
    published: number;
    failed: number;
  }> {
    const tenants = specificTenantId
      ? [specificTenantId]
      : this.options.allowedTenantIds;

    let totalClaimed = 0;
    let totalPublished = 0;
    let totalFailed = 0;

    for (const tenantId of tenants) {
      const requests = await this.redriveStore.claimDue(
        tenantId,
        this.batchSize,
        this.leaseDurationMs,
      );

      totalClaimed += requests.length;

      for (const req of requests) {
        if (!req.leaseToken) {
          continue;
        }

        const success = await this.processSingleRequest(req, req.leaseToken);
        if (success) {
          totalPublished++;
        } else {
          totalFailed++;
        }
      }
    }

    return {
      claimed: totalClaimed,
      published: totalPublished,
      failed: totalFailed,
    };
  }

  private async processSingleRequest(
    req: DeadLetterRedriveRecord,
    leaseToken: string,
  ): Promise<boolean> {
    const deadLetter = await this.deadLetterStore.findById(
      req.tenantId,
      req.deadLetterMessageId,
    );

    if (!deadLetter) {
      await this.redriveStore.failClaim(
        req.tenantId,
        req.id,
        leaseToken,
        'Original dead letter message not found',
      );
      return false;
    }

    let envelope: EventEnvelope;
    try {
      if (
        deadLetter.originalEvent &&
        typeof deadLetter.originalEvent === 'object' &&
        'eventId' in (deadLetter.originalEvent as Record<string, unknown>)
      ) {
        envelope = OutboxEventMapper.toEnvelope(
          deadLetter.originalEvent as Parameters<
            typeof OutboxEventMapper.toEnvelope
          >[0],
        );
      } else {
        throw new Error(
          'Original event in dead letter is not a valid envelope structure',
        );
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      await this.redriveStore.failClaim(
        req.tenantId,
        req.id,
        leaseToken,
        errorMsg,
      );
      return false;
    }

    try {
      // Publicar de retorno exclusivo al consumidor original (sls.return.v1)
      await this.publisher.publish(envelope, {
        exchange: this.returnExchange,
        routingKey: req.consumerName,
        headers: {
          'x-sls-retry-count': 0,
          'x-sls-redrive-id': req.id,
          'x-sls-tenant-id': req.tenantId,
          'x-sls-original-routing-key': `tenant.${req.tenantId}.${envelope.eventType}.v${envelope.version}`,
        },
      });

      await this.redriveStore.markPublished(
        req.tenantId,
        req.id,
        leaseToken,
        new Date(),
      );

      return true;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const nextAttemptAt = new Date(Date.now() + 10000);
      await this.redriveStore.failClaim(
        req.tenantId,
        req.id,
        leaseToken,
        errorMsg,
        nextAttemptAt,
      );
      return false;
    }
  }
}
