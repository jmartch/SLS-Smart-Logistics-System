import {
  Injectable,
  Optional,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { ConfirmChannel, Options } from 'amqplib';
import type { EventEnvelope } from '../../application/messaging/event-envelope';
import type {
  EventPublisherPort,
  PublishOptions,
} from '../../application/messaging/ports/event-publisher.port';
import {
  MessagingError,
  MESSAGING_ERROR_CODES,
} from '../../application/messaging/messaging-errors';
import { RABBITMQ_EXCHANGES } from './rabbitmq-topology';
import { RabbitmqConnectionManager } from './rabbitmq-connection';
import { type MessagingConfig, loadMessagingConfig } from './messaging.config';

@Injectable()
export class RabbitmqConfirmPublisher
  implements EventPublisherPort, OnApplicationShutdown
{
  private confirmChannel: ConfirmChannel | null = null;
  private readonly config: MessagingConfig;
  private readonly unroutableMessageIds = new Set<string>();

  constructor(
    private readonly connectionManager: RabbitmqConnectionManager,
    @Optional() config?: MessagingConfig,
  ) {
    this.config = config ?? loadMessagingConfig();
  }

  private async getConfirmChannel(): Promise<ConfirmChannel> {
    if (this.confirmChannel) {
      return this.confirmChannel;
    }

    const channel = await this.connectionManager.createConfirmChannel();

    channel.on('return', (msg) => {
      const messageId = msg.properties.messageId;
      if (messageId) {
        this.unroutableMessageIds.add(messageId);
      }
    });

    channel.on('error', () => {
      this.confirmChannel = null;
    });

    channel.on('close', () => {
      this.confirmChannel = null;
    });

    this.confirmChannel = channel;
    return channel;
  }

  async publish(event: EventEnvelope, options?: PublishOptions): Promise<void> {
    const channel = await this.getConfirmChannel();
    const exchange = options?.exchange ?? RABBITMQ_EXCHANGES.EVENTS;
    const routingKey =
      options?.routingKey ??
      `tenant.${event.tenantId}.${event.eventType}.v${event.version}`;

    const contentBuffer = Buffer.from(JSON.stringify(event), 'utf-8');

    const headers: Record<string, unknown> = {
      'x-sls-tenant-id': event.tenantId,
      'x-sls-version': event.version,
      'x-sls-producer': event.producer,
      'x-sls-event-type': event.eventType,
      'x-sls-original-routing-key': routingKey,
      'x-sls-retry-count': 0,
      ...(options?.headers ?? {}),
    };

    const publishOptions: Options.Publish = {
      persistent: true,
      mandatory: true,
      contentType: 'application/json',
      contentEncoding: 'utf-8',
      messageId: event.eventId,
      correlationId: event.correlationId,
      timestamp: Math.floor(new Date(event.occurredAt).getTime() / 1000),
      appId: event.producer,
      type: event.eventType,
      headers,
    };

    return new Promise<void>((resolve, reject) => {
      let isSettled = false;

      const timeoutTimer = setTimeout(() => {
        if (!isSettled) {
          isSettled = true;
          this.unroutableMessageIds.delete(event.eventId);
          reject(
            new MessagingError(
              MESSAGING_ERROR_CODES.PUBLISHER_CONFIRM_TIMEOUT,
              `Broker confirmation timed out after ${this.config.confirmTimeoutMs}ms for event ${event.eventId}`,
              'eventId',
              { eventId: event.eventId, exchange, routingKey },
            ),
          );
        }
      }, this.config.confirmTimeoutMs);

      const confirmCallback = (err: unknown) => {
        clearTimeout(timeoutTimer);
        if (isSettled) {
          return;
        }
        isSettled = true;

        if (this.unroutableMessageIds.has(event.eventId)) {
          this.unroutableMessageIds.delete(event.eventId);
          reject(
            new MessagingError(
              MESSAGING_ERROR_CODES.PUBLISHER_UNROUTABLE,
              `Event ${event.eventId} could not be routed to any queue on exchange ${exchange} with routing key ${routingKey}`,
              'routingKey',
              { eventId: event.eventId, exchange, routingKey },
            ),
          );
          return;
        }

        if (err) {
          reject(
            new MessagingError(
              MESSAGING_ERROR_CODES.PUBLISHER_NACK,
              `Broker nacked event ${event.eventId}: ${err instanceof Error ? err.message : String(err)}`,
              'eventId',
              { eventId: event.eventId, exchange, routingKey },
            ),
          );
          return;
        }

        resolve();
      };

      try {
        const canAcceptMore = channel.publish(
          exchange,
          routingKey,
          contentBuffer,
          publishOptions,
          confirmCallback,
        );

        if (!canAcceptMore) {
          channel.once('drain', () => {
            // Channel buffer drained
          });
        }
      } catch (publishErr) {
        clearTimeout(timeoutTimer);
        if (!isSettled) {
          isSettled = true;
          reject(publishErr);
        }
      }
    });
  }

  async close(): Promise<void> {
    if (this.confirmChannel) {
      const ch = this.confirmChannel;
      this.confirmChannel = null;
      try {
        await ch.close();
      } catch {
        // Ignore errors on closing
      }
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.close();
  }
}
