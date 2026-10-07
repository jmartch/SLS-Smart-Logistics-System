export interface DeadLetterRedriveRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly deadLetterMessageId: string;
  readonly consumerName: string;
  readonly requestedBy: string;
  readonly reason: string;
  readonly requestedAt: Date;
  readonly status: 'PENDING' | 'PUBLISHED' | 'FAILED';
  readonly attempts: number;
  readonly nextAttemptAt: Date;
  readonly leaseToken?: string | null;
  readonly lockedUntil?: Date | null;
  readonly lastError?: string | null;
  readonly publishedAt?: Date | null;
}

export interface CreateRedriveRequest {
  readonly id: string;
  readonly tenantId: string;
  readonly deadLetterMessageId: string;
  readonly consumerName: string;
  readonly requestedBy: string;
  readonly reason: string;
}

export interface RedriveStorePort {
  createRequest(
    request: CreateRedriveRequest,
  ): Promise<DeadLetterRedriveRecord>;
  claimDue(
    tenantId: string,
    limit: number,
    leaseDurationMs: number,
  ): Promise<readonly DeadLetterRedriveRecord[]>;
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
}
