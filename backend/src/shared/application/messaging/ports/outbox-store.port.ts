export interface ClaimedOutboxRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly eventId: string;
  readonly correlationId: string | null;
  readonly eventType: string;
  readonly version: number;
  readonly payload: unknown;
  readonly producer: string | null;
  readonly occurredAt: Date;
  readonly attempts: number;
  readonly leaseToken: string;
}

export interface ClaimDueOptions {
  readonly tenantId: string;
  readonly limit: number;
  readonly leaseDurationMs: number;
}

export interface OutboxStorePort {
  claimDue(options: ClaimDueOptions): Promise<readonly ClaimedOutboxRecord[]>;
  renewLease(
    tenantId: string,
    id: string,
    leaseToken: string,
    extraMs: number,
  ): Promise<boolean>;
  markPublished(
    tenantId: string,
    id: string,
    leaseToken: string,
    publishedAt?: Date,
  ): Promise<boolean>;
  failClaim(
    tenantId: string,
    id: string,
    leaseToken: string,
    error: string,
    nextAttemptAt?: Date,
  ): Promise<boolean>;
  markFailedPermanently(
    tenantId: string,
    id: string,
    leaseToken: string,
    error: string,
  ): Promise<boolean>;
}
