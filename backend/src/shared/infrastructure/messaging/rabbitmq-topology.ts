import type { Channel } from 'amqplib';

export const RABBITMQ_EXCHANGES = {
  EVENTS: 'sls.events.v1',
  RETRY: 'sls.retry.v1',
  RETURN: 'sls.return.v1',
  DEAD: 'sls.dead.v1',
  QUARANTINE: 'sls.quarantine.v1',
} as const;

export const RABBITMQ_QUEUES = {
  AUDIT_MAIN: 'sls.audit.integration-events.v1',
  AUDIT_RETRY_5S: 'sls.audit.integration-events.v1.retry.5s',
  AUDIT_RETRY_10S: 'sls.audit.integration-events.v1.retry.10s',
  AUDIT_RETRY_20S: 'sls.audit.integration-events.v1.retry.20s',
  AUDIT_DLQ: 'sls.audit.integration-events.v1.dlq',
  QUARANTINE: 'sls.quarantine.v1',
} as const;

export const AUDIT_CONSUMER_NAME = 'audit.integration-events.v1';

export interface TopologyDefinition {
  readonly exchanges: readonly {
    readonly name: string;
    readonly type: 'topic' | 'direct' | 'fanout';
    readonly options: { readonly durable: boolean };
  }[];
  readonly queues: readonly {
    readonly name: string;
    readonly options: {
      readonly durable: boolean;
      readonly arguments?: Record<string, unknown>;
    };
  }[];
  readonly bindings: readonly {
    readonly queue: string;
    readonly exchange: string;
    readonly routingKey: string;
  }[];
}

export const TOPOLOGY_MANIFEST: TopologyDefinition = {
  exchanges: [
    {
      name: RABBITMQ_EXCHANGES.EVENTS,
      type: 'topic',
      options: { durable: true },
    },
    {
      name: RABBITMQ_EXCHANGES.RETRY,
      type: 'direct',
      options: { durable: true },
    },
    {
      name: RABBITMQ_EXCHANGES.RETURN,
      type: 'direct',
      options: { durable: true },
    },
    {
      name: RABBITMQ_EXCHANGES.DEAD,
      type: 'direct',
      options: { durable: true },
    },
    {
      name: RABBITMQ_EXCHANGES.QUARANTINE,
      type: 'direct',
      options: { durable: true },
    },
  ],
  queues: [
    {
      name: RABBITMQ_QUEUES.AUDIT_MAIN,
      options: {
        durable: true,
        arguments: {
          'x-queue-type': 'quorum',
          'x-dead-letter-exchange': RABBITMQ_EXCHANGES.DEAD,
          'x-dead-letter-routing-key': AUDIT_CONSUMER_NAME,
          'x-delivery-limit': 20,
        },
      },
    },
    {
      name: RABBITMQ_QUEUES.AUDIT_RETRY_5S,
      options: {
        durable: true,
        arguments: {
          'x-queue-type': 'quorum',
          'x-message-ttl': 5000,
          'x-dead-letter-exchange': RABBITMQ_EXCHANGES.RETURN,
          'x-dead-letter-routing-key': AUDIT_CONSUMER_NAME,
        },
      },
    },
    {
      name: RABBITMQ_QUEUES.AUDIT_RETRY_10S,
      options: {
        durable: true,
        arguments: {
          'x-queue-type': 'quorum',
          'x-message-ttl': 10000,
          'x-dead-letter-exchange': RABBITMQ_EXCHANGES.RETURN,
          'x-dead-letter-routing-key': AUDIT_CONSUMER_NAME,
        },
      },
    },
    {
      name: RABBITMQ_QUEUES.AUDIT_RETRY_20S,
      options: {
        durable: true,
        arguments: {
          'x-queue-type': 'quorum',
          'x-message-ttl': 20000,
          'x-dead-letter-exchange': RABBITMQ_EXCHANGES.RETURN,
          'x-dead-letter-routing-key': AUDIT_CONSUMER_NAME,
        },
      },
    },
    {
      name: RABBITMQ_QUEUES.AUDIT_DLQ,
      options: {
        durable: true,
        arguments: {
          'x-queue-type': 'quorum',
        },
      },
    },
    {
      name: RABBITMQ_QUEUES.QUARANTINE,
      options: {
        durable: true,
        arguments: {
          'x-queue-type': 'quorum',
        },
      },
    },
  ],
  bindings: [
    // Main queue bindings: topic from events and direct return from retries/redrives
    {
      queue: RABBITMQ_QUEUES.AUDIT_MAIN,
      exchange: RABBITMQ_EXCHANGES.EVENTS,
      routingKey: 'tenant.*.#',
    },
    {
      queue: RABBITMQ_QUEUES.AUDIT_MAIN,
      exchange: RABBITMQ_EXCHANGES.RETURN,
      routingKey: AUDIT_CONSUMER_NAME,
    },
    // Retry queue bindings
    {
      queue: RABBITMQ_QUEUES.AUDIT_RETRY_5S,
      exchange: RABBITMQ_EXCHANGES.RETRY,
      routingKey: `${AUDIT_CONSUMER_NAME}.retry.1`,
    },
    {
      queue: RABBITMQ_QUEUES.AUDIT_RETRY_10S,
      exchange: RABBITMQ_EXCHANGES.RETRY,
      routingKey: `${AUDIT_CONSUMER_NAME}.retry.2`,
    },
    {
      queue: RABBITMQ_QUEUES.AUDIT_RETRY_20S,
      exchange: RABBITMQ_EXCHANGES.RETRY,
      routingKey: `${AUDIT_CONSUMER_NAME}.retry.3`,
    },
    // DLQ binding
    {
      queue: RABBITMQ_QUEUES.AUDIT_DLQ,
      exchange: RABBITMQ_EXCHANGES.DEAD,
      routingKey: AUDIT_CONSUMER_NAME,
    },
    // Quarantine binding
    {
      queue: RABBITMQ_QUEUES.QUARANTINE,
      exchange: RABBITMQ_EXCHANGES.QUARANTINE,
      routingKey: 'unattributed',
    },
  ],
};

export async function assertRabbitmqTopology(channel: Channel): Promise<void> {
  for (const ex of TOPOLOGY_MANIFEST.exchanges) {
    await channel.assertExchange(ex.name, ex.type, ex.options);
  }

  for (const q of TOPOLOGY_MANIFEST.queues) {
    await channel.assertQueue(q.name, q.options);
  }

  for (const b of TOPOLOGY_MANIFEST.bindings) {
    await channel.bindQueue(b.queue, b.exchange, b.routingKey);
  }
}
