import {
  Injectable,
  Optional,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { Channel, ConsumeMessage } from 'amqplib';
import { RabbitmqConnectionManager } from './rabbitmq-connection';
import { AUDIT_CONSUMER_NAME, RABBITMQ_QUEUES } from './rabbitmq-topology';
import { type MessagingConfig, loadMessagingConfig } from './messaging.config';
import { IdempotentConsumer } from '../../application/messaging/idempotent-consumer';
import { EventValidator } from '../../application/messaging/event-validator';
import {
  MESSAGING_ERROR_CODES,
  MessagingError,
} from '../../application/messaging/messaging-errors';
import type { ConsumerFailureRouterPort } from './consumer-failure-router.port';
import { RabbitmqFailureRouter } from './rabbitmq-failure.router';
import { PrismaAuditConsumerUnitOfWork } from '../../../modules/audit/infrastructure/prisma-audit-consumer-unit-of-work';
import { AuditIntegrationEventConsumer } from '../../../modules/audit/application/audit-integration-event.consumer';
import type { AuditConsumerSession } from '../../../modules/audit/application/audit-consumer-session';

@Injectable()
export class RabbitmqConsumerRunner implements OnApplicationShutdown {
  private channel: Channel | null = null;
  private consumerTag: string | null = null;
  private inFlightCount = 0;
  private isStopping = false;
  private readonly config: MessagingConfig;
  private readonly idempotentConsumer: IdempotentConsumer<AuditConsumerSession>;

  constructor(
    private readonly connectionManager: RabbitmqConnectionManager,
    private readonly auditUow: PrismaAuditConsumerUnitOfWork,
    private readonly auditHandler: AuditIntegrationEventConsumer,
    @Optional() private readonly failureRouter?: RabbitmqFailureRouter,
    @Optional() config?: MessagingConfig,
  ) {
    this.config = config ?? loadMessagingConfig();
    this.idempotentConsumer = new IdempotentConsumer<AuditConsumerSession>(
      AUDIT_CONSUMER_NAME,
      this.auditUow,
    );
  }

  async start(): Promise<void> {
    if (this.channel) {
      return;
    }

    const channel = await this.connectionManager.createChannel();
    this.channel = channel;

    const { consumerTag } = await channel.consume(
      RABBITMQ_QUEUES.AUDIT_MAIN,
      async (msg) => {
        if (!msg) {
          return;
        }

        this.inFlightCount++;
        try {
          await this.processMessage(msg, channel);
        } catch (err: unknown) {
          const error = err instanceof Error ? err : new Error(String(err));
          if (this.failureRouter) {
            await this.failureRouter.routeFailure(msg, channel, error);
          } else {
            // Sin failure router (fallback defensivo): no reencolar en la principal
            channel.nack(msg, false, false);
          }
        } finally {
          this.inFlightCount--;
        }
      },
      { noAck: false },
    );

    this.consumerTag = consumerTag;
  }

  private async processMessage(
    msg: ConsumeMessage,
    channel: Channel,
  ): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(msg.content.toString('utf-8'));
    } catch (parseErr: unknown) {
      throw new MessagingError(
        MESSAGING_ERROR_CODES.EVENT_INVALID_JSON,
        `Malformed JSON in consumed message: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
      );
    }

    // 1. Validar envelope canónico
    const envelope = EventValidator.assertValid(parsed);

    // 2. Verificar consistencia entre headers AMQP y envelope
    const headerTenant = msg.properties.headers?.['x-sls-tenant-id'];
    if (
      typeof headerTenant === 'string' &&
      headerTenant !== envelope.tenantId
    ) {
      throw new MessagingError(
        MESSAGING_ERROR_CODES.EVENT_IDENTITY_MISMATCH,
        `Header x-sls-tenant-id '${headerTenant}' does not match envelope tenantId '${envelope.tenantId}'`,
        'tenantId',
      );
    }

    // 3. Comprobar que el tenant está en la allowlist si está configurada
    if (
      this.config.allowedTenantIds.length > 0 &&
      !this.config.allowedTenantIds.includes(envelope.tenantId)
    ) {
      throw new MessagingError(
        MESSAGING_ERROR_CODES.EVENT_IDENTITY_MISMATCH,
        `Tenant '${envelope.tenantId}' is not authorized for this worker`,
        'tenantId',
      );
    }

    // 4. Ejecutar efecto de forma transaccional e idempotente
    await this.idempotentConsumer.process(envelope, async (session, env) => {
      await this.auditHandler.handle(session, env);
    });

    // 5. ACK tras commit exitoso
    channel.ack(msg);
  }

  async stop(): Promise<void> {
    this.isStopping = true;

    if (this.channel && this.consumerTag) {
      try {
        await this.channel.cancel(this.consumerTag);
      } catch {
        // Ignorar error al cancelar si ya se cerró
      }
      this.consumerTag = null;
    }

    // Esperar a que los mensajes en vuelo terminen (hasta 10s)
    const startWait = Date.now();
    while (this.inFlightCount > 0 && Date.now() - startWait < 10000) {
      await new Promise((r) => setTimeout(r, 50));
    }

    if (this.channel) {
      const ch = this.channel;
      this.channel = null;
      try {
        await ch.close();
      } catch {
        // Ignorar error al cerrar
      }
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.stop();
  }
}
