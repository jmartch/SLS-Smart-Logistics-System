import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import * as amqp from 'amqplib';
import type { Channel, ChannelModel, ConfirmChannel } from 'amqplib';
import { type MessagingConfig, loadMessagingConfig } from './messaging.config';
import { assertRabbitmqTopology } from './rabbitmq-topology';

@Injectable()
export class RabbitmqConnectionManager implements OnApplicationShutdown {
  private connection: ChannelModel | null = null;
  private readonly config: MessagingConfig;

  constructor(config?: MessagingConfig) {
    this.config = config ?? loadMessagingConfig();
  }

  async getConnection(): Promise<ChannelModel> {
    if (this.connection) {
      return this.connection;
    }

    const url = this.config.amqpUrl.includes('heartbeat=')
      ? this.config.amqpUrl
      : `${this.config.amqpUrl}${this.config.amqpUrl.includes('?') ? '&' : '?'}heartbeat=${this.config.heartbeatSeconds}`;

    const conn = await amqp.connect(url);

    conn.on('error', (err) => {
      // Registrar desconexión sin loguear credenciales
      this.connection = null;
    });

    conn.on('close', () => {
      this.connection = null;
    });

    this.connection = conn;
    return conn;
  }

  async createChannel(): Promise<Channel> {
    const conn = await this.getConnection();
    const ch = await conn.createChannel();
    await ch.prefetch(this.config.consumerPrefetch);
    return ch;
  }

  async createConfirmChannel(): Promise<ConfirmChannel> {
    const conn = await this.getConnection();
    return conn.createConfirmChannel();
  }

  async initTopology(): Promise<void> {
    const ch = await this.createChannel();
    try {
      await assertRabbitmqTopology(ch);
    } finally {
      await ch.close();
    }
  }

  async close(): Promise<void> {
    if (this.connection) {
      const conn = this.connection;
      this.connection = null;
      try {
        await conn.close();
      } catch {
        // Ignorar errores al cerrar conexión ya cerrada
      }
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.close();
  }
}
