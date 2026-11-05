import { RequestDeadLetterRedriveUseCase } from '../../application/messaging/request-dead-letter-redrive.use-case';
import { DeadLetterRedrivePublisher } from '../../application/messaging/dead-letter-redrive-publisher';
import type {
  DeadLetterStorePort,
  DeadLetterRecord,
} from '../../application/messaging/ports/dead-letter-store.port';
import type {
  RedriveStorePort,
  DeadLetterRedriveRecord,
} from '../../application/messaging/ports/redrive-store.port';
import type { ProcessedEventRegistry } from '../../application/messaging/ports/consumer-unit-of-work.port';
import type { EventPublisherPort } from '../../application/messaging/ports/event-publisher.port';
import { RABBITMQ_EXCHANGES } from '../../infrastructure/messaging/rabbitmq-topology';

describe('Dead Letter Redrive (F7 - T26, T27, T28)', () => {
  const tenant1 = '11111111-1111-4111-8111-111111111111';
  const tenant2 = '22222222-2222-4222-8222-222222222222';
  const deadLetterId = '33333333-3333-4333-8333-333333333333';
  const eventId = '44444444-4444-4444-8444-444444444444';
  const requestId = '55555555-5555-4555-8555-555555555555';

  const mockDeadLetterRecord: DeadLetterRecord = {
    id: deadLetterId,
    tenantId: tenant1,
    eventId,
    correlationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    sourceQueue: 'sls.audit.integration-events.v1',
    consumerName: 'audit.integration-events.v1',
    attempts: 4,
    failureReason: 'EVENT_RETRIES_EXHAUSTED',
    failureKey: `${tenant1}:audit.integration-events.v1:${eventId}:EVENT_RETRIES_EXHAUSTED`,
    originalEvent: {
      eventId,
      tenantId: tenant1,
      correlationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      eventType: 'PackageDelivered',
      version: 1,
      producer: 'sls-backend.deliveries',
      occurredAt: '2026-10-07T12:00:00.000Z',
      payload: {
        packageId: '66666666-6666-4666-8666-666666666666',
        routeId: '77777777-7777-4777-8777-777777777777',
        stopId: '88888888-8888-4888-8888-888888888888',
        attemptId: '99999999-9999-4999-8999-999999999999',
      },
    },
  };

  describe('RequestDeadLetterRedriveUseCase', () => {
    let mockDeadLetterStore: jest.Mocked<DeadLetterStorePort>;
    let mockRedriveStore: jest.Mocked<RedriveStorePort>;
    let mockProcessedRegistry: jest.Mocked<ProcessedEventRegistry>;
    let useCase: RequestDeadLetterRedriveUseCase;

    beforeEach(() => {
      mockDeadLetterStore = {
        findById: jest.fn().mockResolvedValue(mockDeadLetterRecord),
        recordFailure: jest.fn(),
      };
      mockRedriveStore = {
        createRequest: jest.fn().mockResolvedValue({
          id: requestId,
          tenantId: tenant1,
          deadLetterMessageId: deadLetterId,
          consumerName: 'audit.integration-events.v1',
          requestedBy: 'operator-1',
          reason: 'Manual re-run',
          requestedAt: new Date(),
          status: 'PENDING',
          attempts: 0,
          nextAttemptAt: new Date(),
        }),
        claimDue: jest.fn(),
        markPublished: jest.fn(),
        failClaim: jest.fn(),
      };
      mockProcessedRegistry = {
        tryRegister: jest.fn(),
        isProcessed: jest.fn().mockResolvedValue(false),
      };

      useCase = new RequestDeadLetterRedriveUseCase(
        mockDeadLetterStore,
        mockRedriveStore,
        mockProcessedRegistry,
      );
    });

    it('creates redrive request when operator is authorized and event is not yet processed (T26)', async () => {
      const result = await useCase.execute({
        tenantId: tenant1,
        deadLetterMessageId: deadLetterId,
        requestId,
        reason: 'Manual re-run',
        operatorContext: {
          operatorId: 'operator-1',
          allowedTenantScope: [tenant1],
        },
      });

      expect(result.status).toBe('PENDING');
      expect(mockRedriveStore.createRequest).toHaveBeenCalledWith({
        id: requestId,
        tenantId: tenant1,
        deadLetterMessageId: deadLetterId,
        consumerName: 'audit.integration-events.v1',
        requestedBy: 'operator-1',
        reason: 'Manual re-run',
      });
    });

    it('rejects redrive request if operator is not authorized for tenant scope (T28 fail-closed)', async () => {
      await expect(
        useCase.execute({
          tenantId: tenant2, // Not in operator scope
          deadLetterMessageId: deadLetterId,
          requestId,
          reason: 'Unauthorized attempt',
          operatorContext: {
            operatorId: 'operator-1',
            allowedTenantScope: [tenant1],
          },
        }),
      ).rejects.toThrow(/not authorized/);

      expect(mockRedriveStore.createRequest).not.toHaveBeenCalled();
    });

    it('rejects redrive request if dead letter record is not found for tenant', async () => {
      mockDeadLetterStore.findById.mockResolvedValueOnce(null);

      await expect(
        useCase.execute({
          tenantId: tenant1,
          deadLetterMessageId: 'non-existent',
          requestId,
          reason: 'Not found',
          operatorContext: {
            operatorId: 'operator-1',
            allowedTenantScope: [tenant1],
          },
        }),
      ).rejects.toThrow(/not found/);

      expect(mockRedriveStore.createRequest).not.toHaveBeenCalled();
    });

    it('returns ALREADY_PROCESSED and does not publish if event was already processed (T28)', async () => {
      mockProcessedRegistry.isProcessed.mockResolvedValueOnce(true);

      const result = await useCase.execute({
        tenantId: tenant1,
        deadLetterMessageId: deadLetterId,
        requestId,
        reason: 'Already done',
        operatorContext: {
          operatorId: 'operator-1',
          allowedTenantScope: [tenant1],
        },
      });

      expect(result).toEqual({
        status: 'ALREADY_PROCESSED',
        message: expect.stringContaining('already been processed'),
      });

      expect(mockRedriveStore.createRequest).not.toHaveBeenCalled();
    });
  });

  describe('DeadLetterRedrivePublisher', () => {
    let mockRedriveStore: jest.Mocked<RedriveStorePort>;
    let mockDeadLetterStore: jest.Mocked<DeadLetterStorePort>;
    let mockPublisher: jest.Mocked<EventPublisherPort>;
    let redrivePublisher: DeadLetterRedrivePublisher;

    beforeEach(() => {
      mockRedriveStore = {
        createRequest: jest.fn(),
        claimDue: jest.fn().mockResolvedValue([
          {
            id: requestId,
            tenantId: tenant1,
            deadLetterMessageId: deadLetterId,
            consumerName: 'audit.integration-events.v1',
            requestedBy: 'operator-1',
            reason: 'Manual re-run',
            requestedAt: new Date(),
            status: 'PENDING',
            attempts: 0,
            nextAttemptAt: new Date(),
            leaseToken: 'lease-token-123',
          },
        ]),
        markPublished: jest.fn().mockResolvedValue(true),
        failClaim: jest.fn().mockResolvedValue(true),
      };

      mockDeadLetterStore = {
        findById: jest.fn().mockResolvedValue(mockDeadLetterRecord),
        recordFailure: jest.fn(),
      };

      mockPublisher = {
        publish: jest.fn().mockResolvedValue(undefined),
      };

      redrivePublisher = new DeadLetterRedrivePublisher(
        mockRedriveStore,
        mockDeadLetterStore,
        mockPublisher,
        {
          allowedTenantIds: [tenant1],
          batchSize: 10,
          leaseDurationMs: 30000,
        },
      );
    });

    it('publishes redrive to sls.return.v1 with consumer routing key and marks published (T26)', async () => {
      const result = await redrivePublisher.publishPendingRedrives(tenant1);

      expect(result).toEqual({
        claimed: 1,
        published: 1,
        failed: 0,
      });

      expect(mockPublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId,
          tenantId: tenant1,
          eventType: 'PackageDelivered',
        }),
        expect.objectContaining({
          exchange: RABBITMQ_EXCHANGES.RETURN,
          routingKey: 'audit.integration-events.v1',
          headers: expect.objectContaining({
            'x-sls-retry-count': 0,
            'x-sls-redrive-id': requestId,
            'x-sls-tenant-id': tenant1,
          }),
        }),
      );

      expect(mockRedriveStore.markPublished).toHaveBeenCalledWith(
        tenant1,
        requestId,
        'lease-token-123',
        expect.any(Date),
      );
    });

    it('fails claim when publisher rejects with broker error (T27)', async () => {
      mockPublisher.publish.mockRejectedValueOnce(
        new Error('Broker return nack'),
      );

      const result = await redrivePublisher.publishPendingRedrives(tenant1);

      expect(result).toEqual({
        claimed: 1,
        published: 0,
        failed: 1,
      });

      expect(mockRedriveStore.failClaim).toHaveBeenCalledWith(
        tenant1,
        requestId,
        'lease-token-123',
        'Broker return nack',
        expect.any(Date),
      );
      expect(mockRedriveStore.markPublished).not.toHaveBeenCalled();
    });
  });
});
