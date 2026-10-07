import {
  IdempotentConsumer,
  type ConsumerHandler,
} from '../../application/messaging/idempotent-consumer';
import type { EventEnvelope } from '../../application/messaging/event-envelope';
import type {
  ConsumerSession,
  ConsumerUnitOfWork,
  ProcessedEventRegistry,
} from '../../application/messaging/ports/consumer-unit-of-work.port';

describe('IdempotentConsumer', () => {
  const sampleEnvelope: EventEnvelope = {
    eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    tenantId: '11111111-1111-4111-8111-111111111111',
    correlationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    eventType: 'PackageDelivered',
    occurredAt: '2026-10-07T12:00:00.000Z',
    producer: 'sls-backend.deliveries',
    version: 1,
    payload: { packageId: '44444444-4444-4444-8444-444444444444' },
  };

  const consumerName = 'audit.integration-events.v1';

  let mockRegistry: jest.Mocked<ProcessedEventRegistry>;
  let mockSession: ConsumerSession;
  let mockUow: jest.Mocked<ConsumerUnitOfWork<ConsumerSession>>;
  let idempotentConsumer: IdempotentConsumer<ConsumerSession>;

  beforeEach(() => {
    mockRegistry = {
      tryRegister: jest.fn(),
    };

    mockSession = {
      processedEvents: mockRegistry,
    };

    mockUow = {
      run: jest.fn().mockImplementation((tenantId, work) => work(mockSession)),
    };

    idempotentConsumer = new IdempotentConsumer(consumerName, mockUow);
  });

  it('executes handler and returns APPLIED when event is new', async () => {
    mockRegistry.tryRegister.mockResolvedValueOnce(true);
    const mockHandler = jest.fn().mockResolvedValue(undefined);

    const outcome = await idempotentConsumer.process(
      sampleEnvelope,
      mockHandler,
    );

    expect(outcome).toEqual({
      status: 'APPLIED',
      identity: {
        tenantId: sampleEnvelope.tenantId,
        eventId: sampleEnvelope.eventId,
        consumerName,
      },
    });

    expect(mockUow.run).toHaveBeenCalledWith(
      sampleEnvelope.tenantId,
      expect.any(Function),
    );
    expect(mockRegistry.tryRegister).toHaveBeenCalledWith({
      tenantId: sampleEnvelope.tenantId,
      eventId: sampleEnvelope.eventId,
      consumerName,
    });
    expect(mockHandler).toHaveBeenCalledWith(mockSession, sampleEnvelope);
  });

  it('skips handler and returns DUPLICATE when event was already registered', async () => {
    mockRegistry.tryRegister.mockResolvedValueOnce(false);
    const mockHandler = jest.fn().mockResolvedValue(undefined);

    const outcome = await idempotentConsumer.process(
      sampleEnvelope,
      mockHandler,
    );

    expect(outcome).toEqual({
      status: 'DUPLICATE',
      identity: {
        tenantId: sampleEnvelope.tenantId,
        eventId: sampleEnvelope.eventId,
        consumerName,
      },
    });

    expect(mockRegistry.tryRegister).toHaveBeenCalledTimes(1);
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it('propagates error from handler and rolls back without completing', async () => {
    mockRegistry.tryRegister.mockResolvedValueOnce(true);
    const mockHandler = jest
      .fn()
      .mockRejectedValue(new Error('Handler domain failure'));

    await expect(
      idempotentConsumer.process(sampleEnvelope, mockHandler),
    ).rejects.toThrow('Handler domain failure');

    expect(mockHandler).toHaveBeenCalledTimes(1);
  });

  it('isolates processing identity by consumerName', async () => {
    mockRegistry.tryRegister.mockResolvedValue(true);
    const otherConsumer = new IdempotentConsumer('other.consumer.v1', mockUow);
    const handler = jest.fn().mockResolvedValue(undefined);

    await idempotentConsumer.process(sampleEnvelope, handler);
    await otherConsumer.process(sampleEnvelope, handler);

    expect(mockRegistry.tryRegister).toHaveBeenNthCalledWith(1, {
      tenantId: sampleEnvelope.tenantId,
      eventId: sampleEnvelope.eventId,
      consumerName: 'audit.integration-events.v1',
    });

    expect(mockRegistry.tryRegister).toHaveBeenNthCalledWith(2, {
      tenantId: sampleEnvelope.tenantId,
      eventId: sampleEnvelope.eventId,
      consumerName: 'other.consumer.v1',
    });
  });
});
