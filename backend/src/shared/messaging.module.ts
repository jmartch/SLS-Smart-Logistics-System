import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module';
import { RabbitmqConnectionManager } from './infrastructure/messaging/rabbitmq-connection';
import { RabbitmqConfirmPublisher } from './infrastructure/messaging/rabbitmq-confirm.publisher';
import { PrismaOutboxStore } from './infrastructure/messaging/persistence/prisma-outbox.store';
import { PrismaDeadLetterStore } from './infrastructure/messaging/persistence/prisma-dead-letter.store';
import { PrismaRedriveStore } from './infrastructure/messaging/persistence/prisma-redrive.store';
import { OutboxPublisher } from './application/messaging/outbox-publisher';
import { loadMessagingConfig } from './infrastructure/messaging/messaging.config';

import { RetryPolicy } from './application/messaging/retry-policy';
import { DeadLetterRecorder } from './application/messaging/dead-letter-recorder';
import { RabbitmqFailureRouter } from './infrastructure/messaging/rabbitmq-failure.router';

@Module({
  imports: [PrismaModule],
  providers: [
    RabbitmqConnectionManager,
    RabbitmqConfirmPublisher,
    PrismaOutboxStore,
    PrismaDeadLetterStore,
    PrismaRedriveStore,
    RetryPolicy,
    {
      provide: DeadLetterRecorder,
      useFactory: (store: PrismaDeadLetterStore) =>
        new DeadLetterRecorder(store),
      inject: [PrismaDeadLetterStore],
    },
    RabbitmqFailureRouter,
    {
      provide: OutboxPublisher,
      useFactory: (
        outboxStore: PrismaOutboxStore,
        publisher: RabbitmqConfirmPublisher,
      ) => {
        const config = loadMessagingConfig();
        return new OutboxPublisher(outboxStore, publisher, {
          allowedTenantIds: config.allowedTenantIds,
          batchSize: config.outboxBatchSize,
          leaseDurationMs: config.outboxLeaseMs,
          retryDelaysMs: [5000, 10000, 20000],
        });
      },
      inject: [PrismaOutboxStore, RabbitmqConfirmPublisher],
    },
  ],
  exports: [
    RabbitmqConnectionManager,
    RabbitmqConfirmPublisher,
    PrismaOutboxStore,
    PrismaDeadLetterStore,
    PrismaRedriveStore,
    RetryPolicy,
    DeadLetterRecorder,
    RabbitmqFailureRouter,
    OutboxPublisher,
  ],
})
export class MessagingModule {}
