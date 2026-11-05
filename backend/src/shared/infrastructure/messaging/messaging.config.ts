export interface MessagingConfig {
  readonly amqpUrl: string;
  readonly allowedTenantIds: readonly string[];
  readonly outboxPollIntervalMs: number;
  readonly outboxBatchSize: number;
  readonly outboxLeaseMs: number;
  readonly confirmTimeoutMs: number;
  readonly heartbeatSeconds: number;
  readonly consumerPrefetch: number;
}

export function loadMessagingConfig(env = process.env): MessagingConfig {
  const amqpUrl = env.RABBITMQ_URL || 'amqp://sls:sls@localhost:5672/sls';

  const rawTenants = env.MESSAGING_TENANT_IDS || '';
  const allowedTenantIds = rawTenants
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const outboxPollIntervalMs = env.OUTBOX_POLL_INTERVAL_MS
    ? Number.parseInt(env.OUTBOX_POLL_INTERVAL_MS, 10)
    : 1000;

  const outboxBatchSize = env.OUTBOX_BATCH_SIZE
    ? Number.parseInt(env.OUTBOX_BATCH_SIZE, 10)
    : 20;

  const outboxLeaseMs = env.OUTBOX_LEASE_MS
    ? Number.parseInt(env.OUTBOX_LEASE_MS, 10)
    : 60000;

  const confirmTimeoutMs = env.AMQP_CONFIRM_TIMEOUT_MS
    ? Number.parseInt(env.AMQP_CONFIRM_TIMEOUT_MS, 10)
    : 10000;

  const heartbeatSeconds = env.AMQP_HEARTBEAT_SECONDS
    ? Number.parseInt(env.AMQP_HEARTBEAT_SECONDS, 10)
    : 30;

  const consumerPrefetch = env.CONSUMER_PREFETCH
    ? Number.parseInt(env.CONSUMER_PREFETCH, 10)
    : 10;

  return {
    amqpUrl,
    allowedTenantIds,
    outboxPollIntervalMs,
    outboxBatchSize,
    outboxLeaseMs,
    confirmTimeoutMs,
    heartbeatSeconds,
    consumerPrefetch,
  };
}
