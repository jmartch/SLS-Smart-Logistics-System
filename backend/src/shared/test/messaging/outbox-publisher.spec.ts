import { OutboxPublisher } from '../../application/messaging/outbox-publisher';
import type {
  ClaimedOutboxRecord,
  OutboxStorePort,
} from '../../application/messaging/ports/outbox-store.port';
import type { EventPublisherPort } from '../../application/messaging/ports/event-publisher.port';
import {
  MessagingError,
  MESSAGING_ERROR_CODES,
} from '../../application/messaging/messaging-errors';

describe('OutboxPublisher', () => {
  const tenant1 = '11111111-1111-4111-8111-111111111111';
  const tenant2 = '22222222-2222-4222-8222-222222222222';

  let mockOutboxStore: jest.Mocked<OutboxStorePort>;
  let mockEventPublisher: jest.Mocked<EventPublisherPort>;
  let publisher: OutboxPublisher;

  beforeEach(() => {
    mockOutboxStore = {
      claimDue: jest.fn().mockResolvedValue([]),
      renewLease: jest.fn().mockResolvedValue(true),
      markPublished: jest.fn().mockResolvedValue(true),
      failClaim: jest.fn().mockResolvedValue(true),
      markFailedPermanently: jest.fn().mockResolvedValue(true),
    };

    mockEventPublisher = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    publisher = new OutboxPublisher(mockOutboxStore, mockEventPublisher, {
      allowedTenantIds: [tenant1, tenant2],
      batchSize: 10,
      leaseDurationMs: 30000,
      retryDelaysMs: [5000, 10000, 20000],
      concurrency: 2,
    });
  });

  it('polls across all allowedTenantIds when no specific tenant is provided', async () => {
    const result = await publisher.publishPendingEvents();

    expect(result).toEqual({
      claimed: 0,
      published: 0,
      failedPermanently: 0,
      failedRetryable: 0,
    });

    expect(mockOutboxStore.claimDue).toHaveBeenCalledTimes(2);
    expect(mockOutboxStore.claimDue).toHaveBeenNthCalledWith(1, {
      tenantId: tenant1,
      limit: 10,
      leaseDurationMs: 30000,
    });
    expect(mockOutboxStore.claimDue).toHaveBeenNthCalledWith(2, {
      tenantId: tenant2,
      limit: 10,
      leaseDurationMs: 30000,
    });
  });

  it('polls only the specified tenant when specificTenantId is given', async () => {
    await publisher.publishPendingEvents(tenant1);

    expect(mockOutboxStore.claimDue).toHaveBeenCalledTimes(1);
    expect(mockOutboxStore.claimDue).toHaveBeenCalledWith({
      tenantId: tenant1,
      limit: 10,
      leaseDurationMs: 30000,
    });
  });

  it('publishes valid events and marks them as PUBLISHED', async () => {
    const sampleRecord: ClaimedOutboxRecord = {
      id: 'rec-1',
      tenantId: tenant1,
      eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      correlationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      eventType: 'PackageDelivered',
      version: 1,
      payload: {
        packageId: '44444444-4444-4444-8444-444444444444',
        routeId: '55555555-5555-4555-8555-555555555555',
        stopId: '66666666-6666-4666-8666-666666666666',
        attemptId: '77777777-7777-4777-8777-777777777777',
      },
      producer: 'sls-backend.deliveries',
      occurredAt: new Date('2026-10-07T14:00:00.000Z'),
      attempts: 0,
      leaseToken: 'token-123',
    };

    mockOutboxStore.claimDue.mockResolvedValueOnce([sampleRecord]);

    const result = await publisher.publishPendingEvents(tenant1);

    expect(result).toEqual({
      claimed: 1,
      published: 1,
      failedPermanently: 0,
      failedRetryable: 0,
    });

    expect(mockEventPublisher.publish).toHaveBeenCalledTimes(1);
    expect(mockEventPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: sampleRecord.eventId,
        tenantId: tenant1,
        eventType: 'PackageDelivered',
        producer: 'sls-backend.deliveries',
      }),
    );

    expect(mockOutboxStore.markPublished).toHaveBeenCalledTimes(1);
    expect(mockOutboxStore.markPublished).toHaveBeenCalledWith(
      tenant1,
      'rec-1',
      'token-123',
      expect.any(Date),
    );
  });

  it('marks permanently failed when envelope mapping throws an unrecoverable error', async () => {
    const brokenRecord: ClaimedOutboxRecord = {
      id: 'rec-2',
      tenantId: tenant1,
      eventId: 'invalid-not-a-uuid',
      correlationId: null,
      eventType: 'UnknownEventTypeWithoutProducer',
      version: 1,
      payload: { foo: 'bar' },
      producer: null,
      occurredAt: new Date('2026-10-07T14:00:00.000Z'),
      attempts: 0,
      leaseToken: 'token-456',
    };

    mockOutboxStore.claimDue.mockResolvedValueOnce([brokenRecord]);

    const result = await publisher.publishPendingEvents(tenant1);

    expect(result).toEqual({
      claimed: 1,
      published: 0,
      failedPermanently: 1,
      failedRetryable: 0,
    });

    expect(mockEventPublisher.publish).not.toHaveBeenCalled();
    expect(mockOutboxStore.markFailedPermanently).toHaveBeenCalledTimes(1);
    expect(mockOutboxStore.markFailedPermanently).toHaveBeenCalledWith(
      tenant1,
      'rec-2',
      'token-456',
      expect.any(String),
    );
  });

  it('fails claim with progressive backoff delay when publisher fails', async () => {
    const recordAttempt0: ClaimedOutboxRecord = {
      id: 'rec-3',
      tenantId: tenant1,
      eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      correlationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      eventType: 'PackageDelivered',
      version: 1,
      payload: {
        packageId: '44444444-4444-4444-8444-444444444444',
        routeId: '55555555-5555-4555-8555-555555555555',
        stopId: '66666666-6666-4666-8666-666666666666',
        attemptId: '77777777-7777-4777-8777-777777777777',
      },
      producer: 'sls-backend.deliveries',
      occurredAt: new Date('2026-10-07T14:00:00.000Z'),
      attempts: 0, // First failure -> 5000ms delay
      leaseToken: 'token-789',
    };

    mockOutboxStore.claimDue.mockResolvedValueOnce([recordAttempt0]);
    mockEventPublisher.publish.mockRejectedValueOnce(
      new MessagingError(
        MESSAGING_ERROR_CODES.PUBLISHER_UNROUTABLE,
        'No queue bound',
      ),
    );

    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);

    const result = await publisher.publishPendingEvents(tenant1);

    expect(result).toEqual({
      claimed: 1,
      published: 0,
      failedPermanently: 0,
      failedRetryable: 1,
    });

    expect(mockOutboxStore.markPublished).not.toHaveBeenCalled();
    expect(mockOutboxStore.failClaim).toHaveBeenCalledTimes(1);
    expect(mockOutboxStore.failClaim).toHaveBeenCalledWith(
      tenant1,
      'rec-3',
      'token-789',
      'No queue bound',
      new Date(now + 5000), // First step: 5s
    );

    jest.spyOn(Date, 'now').mockRestore();
  });

  it('uses 10s and 20s delays for subsequent attempt counts', async () => {
    const recordAttempt1: ClaimedOutboxRecord = {
      id: 'rec-4',
      tenantId: tenant1,
      eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      correlationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      eventType: 'PackageDelivered',
      version: 1,
      payload: {
        packageId: '44444444-4444-4444-8444-444444444444',
        routeId: '55555555-5555-4555-8555-555555555555',
        stopId: '66666666-6666-4666-8666-666666666666',
        attemptId: '77777777-7777-4777-8777-777777777777',
      },
      producer: 'sls-backend.deliveries',
      occurredAt: new Date('2026-10-07T14:00:00.000Z'),
      attempts: 1, // Second failure -> 10000ms delay
      leaseToken: 'token-101',
    };

    mockOutboxStore.claimDue.mockResolvedValueOnce([recordAttempt1]);
    mockEventPublisher.publish.mockRejectedValueOnce(
      new Error('Connection lost'),
    );

    const now = 1000000;
    jest.spyOn(Date, 'now').mockReturnValue(now);

    await publisher.publishPendingEvents(tenant1);

    expect(mockOutboxStore.failClaim).toHaveBeenCalledWith(
      tenant1,
      'rec-4',
      'token-101',
      'Connection lost',
      new Date(now + 10000), // Second step: 10s
    );

    jest.spyOn(Date, 'now').mockRestore();
  });
});
