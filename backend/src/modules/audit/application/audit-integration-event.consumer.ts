import type { EventEnvelope } from '../../../shared/application/messaging/event-envelope';
import type { AuditConsumerSession } from './audit-consumer-session';

export class AuditIntegrationEventConsumer {
  static readonly ACTION = 'INTEGRATION_EVENT_RECEIVED';
  static readonly ENTITY_TYPE = 'EventEnvelope';

  async handle(
    session: AuditConsumerSession,
    envelope: EventEnvelope,
  ): Promise<void> {
    await session.auditWriter.recordAudit({
      tenantId: envelope.tenantId,
      actorUserId: null,
      action: AuditIntegrationEventConsumer.ACTION,
      entityType: AuditIntegrationEventConsumer.ENTITY_TYPE,
      entityId: envelope.eventId,
      correlationId: envelope.correlationId,
      metadata: {
        producer: envelope.producer,
        eventType: envelope.eventType,
        version: envelope.version,
        occurredAt: envelope.occurredAt,
        payload: envelope.payload,
      },
      createdAt: new Date(),
    });
  }
}
