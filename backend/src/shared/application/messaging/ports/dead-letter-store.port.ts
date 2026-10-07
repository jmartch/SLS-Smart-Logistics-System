export interface DeadLetterRecord {
  readonly id?: string;
  readonly tenantId: string;
  readonly eventId: string;
  readonly correlationId?: string | null;
  readonly sourceQueue: string;
  readonly consumerName: string;
  readonly attempts: number;
  readonly originalEvent: unknown;
  readonly failureReason: string;
  readonly failedAt?: Date;
  readonly failureKey: string;
  readonly transportMetadata?: unknown;
}

export interface DeadLetterStorePort {
  recordFailure(record: DeadLetterRecord): Promise<void>;
  findById(tenantId: string, id: string): Promise<DeadLetterRecord | null>;
}
