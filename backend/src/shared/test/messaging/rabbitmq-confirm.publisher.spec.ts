import { EventEmitter } from 'node:events';
import type { ConfirmChannel } from 'amqplib';
import { RabbitmqConfirmPublisher } from '../../infrastructure/messaging/rabbitmq-confirm.publisher';
import type { RabbitmqConnectionManager } from '../../infrastructure/messaging/rabbitmq-connection';
import type { EventEnvelope } from '../../application/messaging/event-envelope';
import {
  MessagingError,
  MESSAGING_ERROR_CODES,
} from '../../application/messaging/messaging-errors';
import { RABBITMQ_EXCHANGES } from '../../infrastructure/messaging/rabbitmq-topology';

describe('RabbitmqConfirmPublisher', () => {
  const sampleEvent: EventEnvelope = {
    eventId: '11111111-1111-4111-8111-111111111111',
    tenantId: '22222222-2222-4222-8222-222222222222',
    correlationId: '33333333-3333-4333-8333-333333333333',
    eventType: 'PackageDelivered',
    occurredAt: '2026-10-07T12:00:00.000Z',
    producer: 'sls-backend.deliveries',
    version: '1',
    payload: {
      packageId: '44444444-4444-4444-8444-444444444444',
      recipientName: 'Alice',
    },
  };

  class MockConfirmChannel extends EventEmitter {
    publish = jest.fn();
    close = jest.fn().mockResolvedValue(undefined);
  }

  let mockChannel: MockConfirmChannel;
  let mockConnectionManager: jest.Mocked<RabbitmqConnectionManager>;
  let publisher: RabbitmqConfirmPublisher;

  beforeEach(() => {
    mockChannel = new MockConfirmChannel();
    mockConnectionManager = {
      createConfirmChannel: jest
        .fn()
        .mockResolvedValue(mockChannel as unknown as ConfirmChannel),
      getConnection: jest.fn(),
      createChannel: jest.fn(),
      initTopology: jest.fn(),
      close: jest.fn(),
      onApplicationShutdown: jest.fn(),
    } as unknown as jest.Mocked<RabbitmqConnectionManager>;

    publisher = new RabbitmqConfirmPublisher(mockConnectionManager, {
      amqpUrl: 'amqp://localhost',
      allowedTenantIds: [sampleEvent.tenantId],
      outboxPollIntervalMs: 1000,
      outboxBatchSize: 10,
      outboxLeaseMs: 60000,
      confirmTimeoutMs: 200,
      heartbeatSeconds: 30,
      consumerPrefetch: 10,
    });
  });

  afterEach(async () => {
    await publisher.close();
  });

  it('publishes event successfully with standard routing key and properties', async () => {
    mockChannel.publish.mockImplementation(
      (exchange, routingKey, content, options, callback) => {
        expect(exchange).toBe(RABBITMQ_EXCHANGES.EVENTS);
        expect(routingKey).toBe(
          `tenant.${sampleEvent.tenantId}.${sampleEvent.eventType}.v${sampleEvent.version}`,
        );
        expect(options.persistent).toBe(true);
        expect(options.mandatory).toBe(true);
        expect(options.messageId).toBe(sampleEvent.eventId);
        expect(options.correlationId).toBe(sampleEvent.correlationId);
        expect(options.appId).toBe(sampleEvent.producer);
        expect(options.type).toBe(sampleEvent.eventType);
        expect(options.headers['x-sls-tenant-id']).toBe(sampleEvent.tenantId);
        expect(options.headers['x-sls-version']).toBe(sampleEvent.version);

        const parsedContent = JSON.parse(content.toString('utf-8'));
        expect(parsedContent.eventId).toBe(sampleEvent.eventId);

        callback(null, true);
        return true;
      },
    );

    await expect(publisher.publish(sampleEvent)).resolves.toBeUndefined();
    expect(mockConnectionManager.createConfirmChannel).toHaveBeenCalledTimes(1);
  });

  it('allows overriding exchange and routing key via options', async () => {
    mockChannel.publish.mockImplementation(
      (exchange, routingKey, content, options, callback) => {
        expect(exchange).toBe('custom.exchange');
        expect(routingKey).toBe('custom.routing.key');
        expect(options.headers['x-custom-header']).toBe('test-val');
        callback(null, true);
        return true;
      },
    );

    await expect(
      publisher.publish(sampleEvent, {
        exchange: 'custom.exchange',
        routingKey: 'custom.routing.key',
        headers: { 'x-custom-header': 'test-val' },
      }),
    ).resolves.toBeUndefined();
  });

  it('rejects with PUBLISHER_UNROUTABLE when basic.return is received before ack', async () => {
    mockChannel.publish.mockImplementation(
      (exchange, routingKey, content, options, callback) => {
        // Emit basic.return on the channel for this message
        mockChannel.emit('return', {
          properties: { messageId: sampleEvent.eventId },
          fields: { exchange, routingKey },
        });
        // RabbitMQ then sends ack after return
        callback(null, true);
        return true;
      },
    );

    await expect(publisher.publish(sampleEvent)).rejects.toThrow(
      expect.objectContaining({
        code: MESSAGING_ERROR_CODES.PUBLISHER_UNROUTABLE,
      }),
    );
  });

  it('rejects with PUBLISHER_NACK when broker nacks the publication', async () => {
    mockChannel.publish.mockImplementation(
      (exchange, routingKey, content, options, callback) => {
        callback(new Error('Internal broker error'), false);
        return true;
      },
    );

    await expect(publisher.publish(sampleEvent)).rejects.toThrow(
      expect.objectContaining({
        code: MESSAGING_ERROR_CODES.PUBLISHER_NACK,
      }),
    );
  });

  it('rejects with PUBLISHER_CONFIRM_TIMEOUT when broker confirmation times out', async () => {
    mockChannel.publish.mockImplementation(() => {
      // Intentionally do not call callback to test timeout
      return true;
    });

    await expect(publisher.publish(sampleEvent)).rejects.toThrow(
      expect.objectContaining({
        code: MESSAGING_ERROR_CODES.PUBLISHER_CONFIRM_TIMEOUT,
      }),
    );
  });

  it('handles buffer backpressure and listens for drain event', async () => {
    let drainListenerRegistered = false;
    mockChannel.once = jest.fn().mockImplementation((event, listener) => {
      if (event === 'drain') {
        drainListenerRegistered = true;
      }
      return mockChannel;
    });

    mockChannel.publish.mockImplementation(
      (exchange, routingKey, content, options, callback) => {
        callback(null, true);
        return false; // Buffer full
      },
    );

    await expect(publisher.publish(sampleEvent)).resolves.toBeUndefined();
    expect(drainListenerRegistered).toBe(true);
  });
});
