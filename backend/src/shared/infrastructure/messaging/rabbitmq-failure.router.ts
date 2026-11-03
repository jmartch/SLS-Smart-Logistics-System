import { Injectable, Optional } from '@nestjs/common';
import type { Channel, ConsumeMessage } from 'amqplib';
import type { ConsumerFailureRouterPort } from './consumer-failure-router.port';
import { RabbitmqConnectionManager } from './rabbitmq-connection';
import { RetryPolicy } from '../../application/messaging/retry-policy';
import { DeadLetterRecorder } from '../../application/messaging/dead-letter-recorder';
import {
  AUDIT_CONSUMER_NAME,
  RABBITMQ_EXCHANGES,
  RABBITMQ_QUEUES,
} from './rabbitmq-topology';
import { type MessagingConfig, loadMessagingConfig } from './messaging.config';
import {
  MESSAGING_ERROR_CODES,
  MessagingError,
} from '../../application/messaging/messaging-errors';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class RabbitmqFailureRouter implements ConsumerFailureRouterPort {
  private readonly config: MessagingConfig;

  constructor(
    private readonly connectionManager: RabbitmqConnectionManager,
    private readonly retryPolicy: RetryPolicy,
    private readonly deadLetterRecorder: DeadLetterRecorder,
    @Optional() config?: MessagingConfig,
  ) {
    this.config = config ?? loadMessagingConfig();
  }

  async routeFailure(
    msg: ConsumeMessage,
    channel: Channel,
    error: Error,
  ): Promise<void> {
    const headers: Record<string, unknown> = {
      ...(msg.properties.headers ?? {}),
    };

    const currentRetryCount = Number(headers['x-sls-retry-count'] ?? 0);
    const headerTenant =
      typeof headers['x-sls-tenant-id'] === 'string'
        ? headers['x-sls-tenant-id']
        : undefined;

    const messageId = msg.properties.messageId || 'unknown-message';
    const correlationId = msg.properties.correlationId ?? null;
    const consumerName = AUDIT_CONSUMER_NAME;
    const sourceQueue = RABBITMQ_QUEUES.AUDIT_MAIN;

    // Verificar si el tenant es válido y autorizado
    let hasTrustedTenant = false;
    if (headerTenant && UUID_REGEX.test(headerTenant)) {
      if (
        this.config.allowedTenantIds.length === 0 ||
        this.config.allowedTenantIds.includes(headerTenant)
      ) {
        hasTrustedTenant = true;
      }
    }

    if (error instanceof MessagingError) {
      if (error.code === MESSAGING_ERROR_CODES.EVENT_IDENTITY_MISMATCH) {
        hasTrustedTenant = false;
      }
    }

    const decision = this.retryPolicy.evaluate(
      error,
      currentRetryCount,
      consumerName,
      hasTrustedTenant,
    );

    const confirmChannel = await this.connectionManager.createConfirmChannel();

    if (decision.action === 'RETRY') {
      const updatedHeaders = {
        ...headers,
        'x-sls-retry-count': decision.step,
        'x-sls-last-error': error.message,
        'x-sls-failed-at': new Date().toISOString(),
      };

      await new Promise<void>((resolve, reject) => {
        confirmChannel.publish(
          RABBITMQ_EXCHANGES.RETRY,
          decision.routingKey,
          msg.content,
          {
            ...msg.properties,
            persistent: true,
            headers: updatedHeaders,
          },
          (err) => (err ? reject(err) : resolve()),
        );
      });

      channel.ack(msg);
      return;
    }

    if (decision.action === 'DLQ') {
      if (headerTenant && hasTrustedTenant) {
        let rawEvent: unknown = null;
        try {
          rawEvent = JSON.parse(msg.content.toString('utf-8'));
        } catch {
          rawEvent = msg.content.toString('utf-8');
        }

        await this.deadLetterRecorder.record({
          tenantId: headerTenant,
          eventId: messageId,
          correlationId,
          sourceQueue,
          consumerName,
          attempts: currentRetryCount + 1,
          originalEvent: rawEvent,
          failureReason: decision.reason,
          transportMetadata: {
            fields: msg.fields,
            properties: msg.properties,
          },
        });
      }

      const updatedHeaders = {
        ...headers,
        'x-sls-dead-reason': decision.reason,
        'x-sls-dead-at': new Date().toISOString(),
      };

      await new Promise<void>((resolve, reject) => {
        confirmChannel.publish(
          RABBITMQ_EXCHANGES.DEAD,
          consumerName,
          msg.content,
          {
            ...msg.properties,
            persistent: true,
            headers: updatedHeaders,
          },
          (err) => (err ? reject(err) : resolve()),
        );
      });

      channel.ack(msg);
      return;
    }

    // decision.action === 'QUARANTINE'
    const updatedHeaders = {
      ...headers,
      'x-sls-quarantine-reason': decision.reason,
      'x-sls-quarantined-at': new Date().toISOString(),
    };

    await new Promise<void>((resolve, reject) => {
      confirmChannel.publish(
        RABBITMQ_EXCHANGES.QUARANTINE,
        'unattributed',
        msg.content,
        {
          ...msg.properties,
          persistent: true,
          headers: updatedHeaders,
        },
        (err) => (err ? reject(err) : resolve()),
      );
    });

    channel.ack(msg);
  }
}
