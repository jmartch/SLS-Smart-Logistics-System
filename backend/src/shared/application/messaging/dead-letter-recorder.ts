import type {
  DeadLetterRecord,
  DeadLetterStorePort,
} from './ports/dead-letter-store.port';

export interface RecordFailureInput {
  readonly tenantId: string;
  readonly eventId: string;
  readonly correlationId?: string | null;
  readonly sourceQueue: string;
  readonly consumerName: string;
  readonly attempts: number;
  readonly originalEvent: unknown;
  readonly failureReason: string;
  readonly transportMetadata?: unknown;
}

export class DeadLetterRecorder {
  constructor(private readonly store: DeadLetterStorePort) {}

  async record(input: RecordFailureInput): Promise<void> {
    const rawReason = input.failureReason.split(':')[0].trim();
    const reasonCode = rawReason.replace(/[^a-zA-Z0-9_-]/g, '_');
    const failureKey = `${input.tenantId}:${input.consumerName}:${input.eventId}:${reasonCode}`;

    const record: DeadLetterRecord = {
      tenantId: input.tenantId,
      eventId: input.eventId,
      correlationId: input.correlationId ?? null,
      sourceQueue: input.sourceQueue,
      consumerName: input.consumerName,
      attempts: input.attempts,
      originalEvent: input.originalEvent,
      failureReason: input.failureReason,
      failureKey,
      failedAt: new Date(),
      transportMetadata: input.transportMetadata,
    };

    await this.store.recordFailure(record);
  }
}
