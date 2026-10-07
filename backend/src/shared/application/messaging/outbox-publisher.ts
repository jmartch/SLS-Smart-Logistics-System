import type { EventEnvelope } from './event-envelope';
import type {
  ClaimedOutboxRecord,
  OutboxStorePort,
} from './ports/outbox-store.port';
import type { EventPublisherPort } from './ports/event-publisher.port';
import { MESSAGING_ERROR_CODES, MessagingError } from './messaging-errors';
import { OutboxEventMapper } from './outbox-event.mapper';

export interface OutboxPublisherOptions {
  readonly allowedTenantIds: readonly string[];
  readonly batchSize?: number;
  readonly leaseDurationMs?: number;
  readonly retryDelaysMs?: readonly number[];
  readonly concurrency?: number;
}

export interface PublishBatchResult {
  readonly claimed: number;
  readonly published: number;
  readonly failedPermanently: number;
  readonly failedRetryable: number;
}

const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_LEASE_DURATION_MS = 60000;
const DEFAULT_RETRY_DELAYS_MS = [5000, 10000, 20000] as const;
const DEFAULT_CONCURRENCY = 5;

export class OutboxPublisher {
  private readonly batchSize: number;
  private readonly leaseDurationMs: number;
  private readonly retryDelaysMs: readonly number[];
  private readonly concurrency: number;

  constructor(
    private readonly outboxStore: OutboxStorePort,
    private readonly eventPublisher: EventPublisherPort,
    private readonly options: OutboxPublisherOptions,
  ) {
    this.batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    this.leaseDurationMs = options.leaseDurationMs ?? DEFAULT_LEASE_DURATION_MS;
    this.retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
    this.concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
  }

  async publishPendingEvents(
    specificTenantId?: string,
  ): Promise<PublishBatchResult> {
    const tenantsToProcess = specificTenantId
      ? [specificTenantId]
      : this.options.allowedTenantIds;

    let totalClaimed = 0;
    let totalPublished = 0;
    let totalFailedPermanently = 0;
    let totalFailedRetryable = 0;

    for (const tenantId of tenantsToProcess) {
      const records = await this.outboxStore.claimDue({
        tenantId,
        limit: this.batchSize,
        leaseDurationMs: this.leaseDurationMs,
      });

      if (records.length === 0) {
        continue;
      }

      totalClaimed += records.length;

      // Procesar lote con concurrencia controlada
      const results = await this.processBatch(records);
      for (const res of results) {
        if (res.status === 'PUBLISHED') {
          totalPublished++;
        } else if (res.status === 'PERMANENT_FAILURE') {
          totalFailedPermanently++;
        } else {
          totalFailedRetryable++;
        }
      }
    }

    return {
      claimed: totalClaimed,
      published: totalPublished,
      failedPermanently: totalFailedPermanently,
      failedRetryable: totalFailedRetryable,
    };
  }

  private async processBatch(
    records: readonly ClaimedOutboxRecord[],
  ): Promise<
    { status: 'PUBLISHED' | 'PERMANENT_FAILURE' | 'RETRYABLE_FAILURE' }[]
  > {
    const results: {
      status: 'PUBLISHED' | 'PERMANENT_FAILURE' | 'RETRYABLE_FAILURE';
    }[] = [];

    // Chunks según la concurrencia configurada
    for (let i = 0; i < records.length; i += this.concurrency) {
      const chunk = records.slice(i, i + this.concurrency);
      const chunkResults = await Promise.all(
        chunk.map((rec) => this.processSingleRecord(rec)),
      );
      results.push(...chunkResults);
    }

    return results;
  }

  private async processSingleRecord(
    record: ClaimedOutboxRecord,
  ): Promise<{
    status: 'PUBLISHED' | 'PERMANENT_FAILURE' | 'RETRYABLE_FAILURE';
  }> {
    let envelope: EventEnvelope;

    // 1. Mapeo del registro a EventEnvelope canónico
    try {
      envelope = OutboxEventMapper.toEnvelope({
        id: record.id,
        tenantId: record.tenantId,
        eventId: record.eventId,
        correlationId: record.correlationId,
        eventType: record.eventType,
        version: record.version,
        payload: record.payload,
        producer: record.producer,
        occurredAt: record.occurredAt,
      });
    } catch (err: unknown) {
      // Errores de mapeo/identidad son fallos permanentes no recuperables
      const errorMsg = err instanceof Error ? err.message : String(err);
      await this.outboxStore.markFailedPermanently(
        record.tenantId,
        record.id,
        record.leaseToken,
        errorMsg,
      );
      return { status: 'PERMANENT_FAILURE' };
    }

    // 2. Publicación al transporte AMQP con confirms y returns
    try {
      await this.eventPublisher.publish(envelope);

      await this.outboxStore.markPublished(
        record.tenantId,
        record.id,
        record.leaseToken,
        new Date(),
      );

      return { status: 'PUBLISHED' };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const delayIndex = Math.min(
        record.attempts,
        this.retryDelaysMs.length - 1,
      );
      const delayMs = this.retryDelaysMs[delayIndex] ?? 20000;
      const nextAttemptAt = new Date(Date.now() + delayMs);

      await this.outboxStore.failClaim(
        record.tenantId,
        record.id,
        record.leaseToken,
        errorMsg,
        nextAttemptAt,
      );

      return { status: 'RETRYABLE_FAILURE' };
    }
  }
}
