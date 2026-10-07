import type { Channel, ConfirmChannel, ConsumeMessage } from 'amqplib';
import { RabbitmqFailureRouter } from '../../infrastructure/messaging/rabbitmq-failure.router';
import type { RabbitmqConnectionManager } from '../../infrastructure/messaging/rabbitmq-connection';
import { RetryPolicy } from '../../application/messaging/retry-policy';
import type { DeadLetterRecorder } from '../../application/messaging/dead-letter-recorder';
import {
  AUDIT_CONSUMER_NAME,
  RABBITMQ_EXCHANGES,
} from '../../infrastructure/messaging/rabbitmq-topology';
import {
  MESSAGING_ERROR_CODES,
  MessagingError,
} from '../../application/messaging/messaging-errors';

describe('RabbitmqFailureRouter', () => {
  const tenant1 = '11111111-1111-4111-8111-111111111111';

  let mockChannel: jest.Mocked<Channel>;
  let mockConfirmChannel: jest.Mocked<ConfirmChannel>;
  let mockConnectionManager: jest.Mocked<RabbitmqConnectionManager>;
  let mockDeadLetterRecorder: jest.Mocked<DeadLetterRecorder>;
  let router: RabbitmqFailureRouter;

  function createMockMessage(
    headers: Record<string, unknown> = { 'x-sls-tenant-id': tenant1 },
  ): ConsumeMessage {
    return {
      content: Buffer.from(JSON.stringify({ eventId: 'event-1' }), 'utf-8'),
      fields: {
        deliveryTag: 1,
        redelivered: false,
        exchange: 'sls.events.v1',
        routingKey: `tenant.${tenant1}.PackageDelivered.v1`,
        consumerTag: 'tag-1',
      },
      properties: {
        messageId: 'event-1',
        correlationId: 'corr-1',
        headers,
      },
    } as unknown as ConsumeMessage;
  }

  beforeEach(() => {
    mockChannel = {
      ack: jest.fn(),
      nack: jest.fn(),
    } as unknown as jest.Mocked<Channel>;

    mockConfirmChannel = {
      publish: jest.fn().mockImplementation((ex, rk, content, options, cb) => {
        cb(null, true);
        return true;
      }),
    } as unknown as jest.Mocked<ConfirmChannel>;

    mockConnectionManager = {
      createConfirmChannel: jest.fn().mockResolvedValue(mockConfirmChannel),
      createChannel: jest.fn(),
      getConnection: jest.fn(),
      initTopology: jest.fn(),
      close: jest.fn(),
      onApplicationShutdown: jest.fn(),
    } as unknown as jest.Mocked<RabbitmqConnectionManager>;

    mockDeadLetterRecorder = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<DeadLetterRecorder>;

    router = new RabbitmqFailureRouter(
      mockConnectionManager,
      new RetryPolicy(),
      mockDeadLetterRecorder,
      {
        amqpUrl: 'amqp://localhost',
        allowedTenantIds: [tenant1],
        outboxPollIntervalMs: 1000,
        outboxBatchSize: 10,
        outboxLeaseMs: 60000,
        confirmTimeoutMs: 10000,
        heartbeatSeconds: 30,
        consumerPrefetch: 10,
      },
    );
  });

  it('routes transient error to RETRY exchange and acks original message', async () => {
    const msg = createMockMessage({
      'x-sls-tenant-id': tenant1,
      'x-sls-retry-count': 0,
    });

    await router.routeFailure(msg, mockChannel, new Error('Transient failure'));

    expect(mockConfirmChannel.publish).toHaveBeenCalledWith(
      RABBITMQ_EXCHANGES.RETRY,
      `${AUDIT_CONSUMER_NAME}.retry.1`,
      msg.content,
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-sls-retry-count': 1,
          'x-sls-last-error': 'Transient failure',
        }),
      }),
      expect.any(Function),
    );

    expect(mockChannel.ack).toHaveBeenCalledWith(msg);
    expect(mockDeadLetterRecorder.record).not.toHaveBeenCalled();
  });

  it('routes permanent error to DEAD exchange, persists in DB DLQ, and acks message', async () => {
    const msg = createMockMessage({
      'x-sls-tenant-id': tenant1,
      'x-sls-retry-count': 0,
    });

    const validationError = new MessagingError(
      MESSAGING_ERROR_CODES.EVENT_INVALID_ENVELOPE,
      'Invalid envelope schema',
    );

    await router.routeFailure(msg, mockChannel, validationError);

    expect(mockDeadLetterRecorder.record).toHaveBeenCalledTimes(1);
    expect(mockDeadLetterRecorder.record).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: tenant1,
        eventId: 'event-1',
        consumerName: AUDIT_CONSUMER_NAME,
        attempts: 1,
      }),
    );

    expect(mockConfirmChannel.publish).toHaveBeenCalledWith(
      RABBITMQ_EXCHANGES.DEAD,
      AUDIT_CONSUMER_NAME,
      msg.content,
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-sls-dead-reason': expect.stringContaining(
            MESSAGING_ERROR_CODES.EVENT_INVALID_ENVELOPE,
          ),
        }),
      }),
      expect.any(Function),
    );

    expect(mockChannel.ack).toHaveBeenCalledWith(msg);
  });

  it('routes to QUARANTINE exchange when tenant identity is mismatched or missing', async () => {
    const msg = createMockMessage({
      'x-sls-tenant-id': 'unauthorized-or-missing',
    });

    await router.routeFailure(msg, mockChannel, new Error('Untrusted sender'));

    expect(mockConfirmChannel.publish).toHaveBeenCalledWith(
      RABBITMQ_EXCHANGES.QUARANTINE,
      'unattributed',
      msg.content,
      expect.any(Object),
      expect.any(Function),
    );

    expect(mockDeadLetterRecorder.record).not.toHaveBeenCalled();
    expect(mockChannel.ack).toHaveBeenCalledWith(msg);
  });

  it('does not ack original message if destination publishing rejects', async () => {
    mockConfirmChannel.publish.mockImplementation(
      (ex, rk, content, options, cb) => {
        cb(new Error('Broker unreachable'), false);
        return true;
      },
    );

    const msg = createMockMessage();

    await expect(
      router.routeFailure(msg, mockChannel, new Error('Error')),
    ).rejects.toThrow('Broker unreachable');

    expect(mockChannel.ack).not.toHaveBeenCalled();
  });
});
