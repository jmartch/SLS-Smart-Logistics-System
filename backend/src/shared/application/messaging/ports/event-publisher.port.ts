import type { EventEnvelope } from '../event-envelope';

export interface PublishOptions {
  readonly exchange?: string;
  readonly routingKey?: string;
  readonly headers?: Record<string, unknown>;
}

export interface EventPublisherPort {
  publish(event: EventEnvelope, options?: PublishOptions): Promise<void>;
}
