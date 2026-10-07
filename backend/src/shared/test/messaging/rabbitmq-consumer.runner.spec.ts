import type { Channel, ConsumeMessage } from 'amqplib';
import { RabbitmqConsumerRunner } from '../../infrastructure/messaging/rabbitmq-consumer.runner';
import type { RabbitmqConnectionManager } from '../../infrastructure/messaging/rabbitmq-connection';
import type { PrismaAuditConsumerUnitOfWork } from '../../../modules/audit/infrastructure/prisma-audit-consumer-unit-of-work';
import type { AuditIntegrationEventConsumer } from '../../../modules/audit/application/audit-integration-event.consumer';
import type { ConsumerFailureRouterPort } from '../../infrastructure/messaging/consumer-failure-router.port';
import {
  MESSAGING_ERROR_CODES,
  MessagingError,
} from '../../application/messaging/messaging-errors';
import type { EventEnvelope } from '../../application/messaging/event-envelope';
import type { AuditConsumerSession } from '../../../modules/audit/application/audit-consumer-session';
import type { ProcessedEventRegistry } from '../../application/messaging/ports/consumer-unit-of-work.port';

describe('RabbitmqConsumerRunner', () => {
  const tenant1 = '11111111-1111-4111-8111-111111111111';
  const sampleEnvelope: EventEnvelope = {
    eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    tenantId: tenant1,
    correlationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    eventType: 'PackageDelivered',
    occurredAt: '2026-10-07T12:00:00.000Z',
    producer: 'sls-backend.deliveries',
    version: 1,
    payload: {
      packageId: '44444444-4444-4444-8444-444444444444',
      routeId: '55555555-5555-4555-8555-555555555555',
      stopId: '66666666-6666-4666-8666-666666666666',
      attemptId: '77777777-7777-4777-8777-777777777777',
    },
  };

  let mockChannel: jest.Mocked<Channel>;
  let mockConnectionManager: jest.Mocked<RabbitmqConnectionManager>;
  let mockAuditUow: jest.Mocked<PrismaAuditConsumerUnitOfWork>;
  let mockAuditHandler: jest.Mocked<AuditIntegrationEventConsumer>;
  let mockFailureRouter: jest.Mocked<ConsumerFailureRouterPort>;
  let mockProcessedEvents: jest.Mocked<ProcessedEventRegistry>;
  let runner: RabbitmqConsumerRunner;
  let consumeCallback: (msg: ConsumeMessage | null) => Promise<void>;

  function createMockMessage(
    payload: unknown,
    headers: Record<string, unknown> = { 'x-sls-tenant-id': tenant1 },
  ): ConsumeMessage {
    const content = Buffer.from(
      typeof payload === 'string' ? payload : JSON.stringify(payload),
      'utf-8',
    );
    return {
      content,
      fields: {
        deliveryTag: 1,
        redelivered: false,
        exchange: 'sls.events.v1',
        routingKey: `tenant.${tenant1}.PackageDelivered.v1`,
        consumerTag: 'tag-1',
      },
      properties: {
        contentType: 'application/json',
        contentEncoding: 'utf-8',
        headers,
        deliveryMode: 2,
        priority: 0,
        correlationId: sampleEnvelope.correlationId,
        messageId: sampleEnvelope.eventId,
        timestamp: 123456789,
        type: sampleEnvelope.eventType,
        appId: sampleEnvelope.producer,
      },
    } as unknown as ConsumeMessage;
  }

  beforeEach(() => {
    mockChannel = {
      consume: jest.fn().mockImplementation((queue, callback) => {
        consumeCallback = callback;
        return Promise.resolve({ consumerTag: 'tag-1' });
      }),
      ack: jest.fn(),
      nack: jest.fn(),
      cancel: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<Channel>;

    mockConnectionManager = {
      createChannel: jest.fn().mockResolvedValue(mockChannel),
      createConfirmChannel: jest.fn(),
      getConnection: jest.fn(),
      initTopology: jest.fn(),
      close: jest.fn(),
      onApplicationShutdown: jest.fn(),
    } as unknown as jest.Mocked<RabbitmqConnectionManager>;

    mockProcessedEvents = {
      tryRegister: jest.fn().mockResolvedValue(true),
    };

    const session: AuditConsumerSession = {
      processedEvents: mockProcessedEvents,
      auditWriter: { recordAudit: jest.fn().mockResolvedValue(undefined) },
    };

    mockAuditUow = {
      run: jest.fn().mockImplementation((tenantId, work) => work(session)),
    } as unknown as jest.Mocked<PrismaAuditConsumerUnitOfWork>;

    mockAuditHandler = {
      handle: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuditIntegrationEventConsumer>;

    mockFailureRouter = {
      routeFailure: jest.fn().mockResolvedValue(undefined),
    };

    runner = new RabbitmqConsumerRunner(
      mockConnectionManager,
      mockAuditUow,
      mockAuditHandler,
      mockFailureRouter as unknown as any,
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

  afterEach(async () => {
    await runner.stop();
  });

  it('processes valid message, invokes audit handler, and acks message', async () => {
    await runner.start();
    const msg = createMockMessage(sampleEnvelope);

    await consumeCallback(msg);

    expect(mockAuditHandler.handle).toHaveBeenCalledTimes(1);
    expect(mockChannel.ack).toHaveBeenCalledWith(msg);
    expect(mockChannel.nack).not.toHaveBeenCalled();
    expect(mockFailureRouter.routeFailure).not.toHaveBeenCalled();
  });

  it('acks message when event is duplicate without invoking handler', async () => {
    mockProcessedEvents.tryRegister.mockResolvedValueOnce(false);
    await runner.start();
    const msg = createMockMessage(sampleEnvelope);

    await consumeCallback(msg);

    expect(mockAuditHandler.handle).not.toHaveBeenCalled();
    expect(mockChannel.ack).toHaveBeenCalledWith(msg);
  });

  it('routes to failure router when JSON is invalid', async () => {
    await runner.start();
    const msg = createMockMessage('{ not valid json', {
      'x-sls-tenant-id': tenant1,
    });

    await consumeCallback(msg);

    expect(mockChannel.ack).not.toHaveBeenCalled();
    expect(mockFailureRouter.routeFailure).toHaveBeenCalledTimes(1);
    expect(mockFailureRouter.routeFailure).toHaveBeenCalledWith(
      msg,
      mockChannel,
      expect.objectContaining({
        code: MESSAGING_ERROR_CODES.EVENT_INVALID_JSON,
      }),
    );
  });

  it('routes to failure router when header tenant does not match envelope tenant', async () => {
    await runner.start();
    const msg = createMockMessage(sampleEnvelope, {
      'x-sls-tenant-id': '99999999-9999-4999-8999-999999999999',
    });

    await consumeCallback(msg);

    expect(mockChannel.ack).not.toHaveBeenCalled();
    expect(mockFailureRouter.routeFailure).toHaveBeenCalledWith(
      msg,
      mockChannel,
      expect.objectContaining({
        code: MESSAGING_ERROR_CODES.EVENT_IDENTITY_MISMATCH,
      }),
    );
  });

  it('routes to failure router when tenant is not in allowedTenantIds', async () => {
    const foreignTenant = '99999999-9999-4999-8999-999999999999';
    const foreignEnvelope: EventEnvelope = {
      ...sampleEnvelope,
      tenantId: foreignTenant,
    };
    await runner.start();
    const msg = createMockMessage(foreignEnvelope, {
      'x-sls-tenant-id': foreignTenant,
    });

    await consumeCallback(msg);

    expect(mockChannel.ack).not.toHaveBeenCalled();
    expect(mockFailureRouter.routeFailure).toHaveBeenCalledWith(
      msg,
      mockChannel,
      expect.objectContaining({
        code: MESSAGING_ERROR_CODES.EVENT_IDENTITY_MISMATCH,
      }),
    );
  });

  it('falls back to nack without requeue when error occurs and failure router is not provided', async () => {
    const runnerWithoutRouter = new RabbitmqConsumerRunner(
      mockConnectionManager,
      mockAuditUow,
      mockAuditHandler,
      undefined,
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

    await runnerWithoutRouter.start();
    const msg = createMockMessage('{ invalid json');

    await consumeCallback(msg);

    expect(mockChannel.nack).toHaveBeenCalledWith(msg, false, false);
    await runnerWithoutRouter.stop();
  });
});
