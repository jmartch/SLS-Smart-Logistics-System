import type { ConsumerSession } from '../../../shared/application/messaging/ports/consumer-unit-of-work.port';
import type { AuditWriterPort } from './ports/audit-writer.port';

export interface AuditConsumerSession extends ConsumerSession {
  readonly auditWriter: AuditWriterPort;
}
