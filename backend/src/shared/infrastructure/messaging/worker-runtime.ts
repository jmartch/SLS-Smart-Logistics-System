import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { RabbitmqConnectionManager } from './rabbitmq-connection';
import { OutboxPublisher } from '../../application/messaging/outbox-publisher';
import { RabbitmqConsumerRunner } from './rabbitmq-consumer.runner';
import { type MessagingConfig, loadMessagingConfig } from './messaging.config';

@Injectable()
export class WorkerRuntime implements OnApplicationShutdown {
  private publisherTimer: NodeJS.Timeout | null = null;
  private isPolling = false;
  private isRunning = false;
  private readonly config: MessagingConfig;

  constructor(
    private readonly connectionManager: RabbitmqConnectionManager,
    private readonly outboxPublisher: OutboxPublisher,
    private readonly consumerRunner: RabbitmqConsumerRunner,
    config?: MessagingConfig,
  ) {
    this.config = config ?? loadMessagingConfig();
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }
    this.isRunning = true;

    // 1. Inicializar topología de RabbitMQ
    await this.connectionManager.initTopology();

    // 2. Iniciar consumidor AMQP
    await this.consumerRunner.start();

    // 3. Iniciar loop de polling del outbox
    this.scheduleOutboxPoll();
  }

  private scheduleOutboxPoll(): void {
    if (!this.isRunning) {
      return;
    }

    this.publisherTimer = setTimeout(async () => {
      if (!this.isRunning) {
        return;
      }

      if (!this.isPolling) {
        this.isPolling = true;
        try {
          await this.outboxPublisher.publishPendingEvents();
        } catch {
          // Capturar error para mantener el loop activo
        } finally {
          this.isPolling = false;
        }
      }

      this.scheduleOutboxPoll();
    }, this.config.outboxPollIntervalMs);
  }

  async stop(): Promise<void> {
    this.isRunning = false;

    if (this.publisherTimer) {
      clearTimeout(this.publisherTimer);
      this.publisherTimer = null;
    }

    await this.consumerRunner.stop();
    await this.connectionManager.close();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.stop();
  }
}
