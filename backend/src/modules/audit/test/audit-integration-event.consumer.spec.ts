import { AuditIntegrationEventConsumer } from '../application/audit-integration-event.consumer';
import type { AuditConsumerSession } from '../application/audit-consumer-session';
import type { AuditWriterPort } from '../application/ports/audit-writer.port';
import type { EventEnvelope } from '../../../shared/application/messaging/event-envelope';
import type { ProcessedEventRegistry } from '../../../shared/application/messaging/ports/consumer-unit-of-work.port';

describe('AuditIntegrationEventConsumer', () => {
  const sampleEnvelope: EventEnvelope = {
    eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    tenantId: '11111111-1111-4111-8111-111111111111',
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

  let mockAuditWriter: jest.Mocked<AuditWriterPort>;
  let mockSession: AuditConsumerSession;
  let consumer: AuditIntegrationEventConsumer;

  beforeEach(() => {
    mockAuditWriter = {
      recordAudit: jest.fn().mockResolvedValue(undefined),
    };

    mockSession = {
      processedEvents: {} as ProcessedEventRegistry,
      auditWriter: mockAuditWriter,
    };

    consumer = new AuditIntegrationEventConsumer();
  });

  it('records an audit log entry with action INTEGRATION_EVENT_RECEIVED and metadata', async () => {
    await consumer.handle(mockSession, sampleEnvelope);

    expect(mockAuditWriter.recordAudit).toHaveBeenCalledTimes(1);
    expect(mockAuditWriter.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: sampleEnvelope.tenantId,
        actorUserId: null,
        action: 'INTEGRATION_EVENT_RECEIVED',
        entityType: 'EventEnvelope',
        entityId: sampleEnvelope.eventId,
        correlationId: sampleEnvelope.correlationId,
        metadata: {
          producer: sampleEnvelope.producer,
          eventType: sampleEnvelope.eventType,
          version: sampleEnvelope.version,
          occurredAt: sampleEnvelope.occurredAt,
          payload: sampleEnvelope.payload,
        },
        createdAt: expect.any(Date),
      }),
    );
  });
});
