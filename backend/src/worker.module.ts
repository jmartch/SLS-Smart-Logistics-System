import { Module } from '@nestjs/common';
import { PrismaModule } from './database/prisma.module';
import { AuditModule } from './modules/audit/audit.module';
import { MessagingModule } from './shared/messaging.module';
import { RabbitmqConsumerRunner } from './shared/infrastructure/messaging/rabbitmq-consumer.runner';
import { WorkerRuntime } from './shared/infrastructure/messaging/worker-runtime';

@Module({
  imports: [PrismaModule, AuditModule, MessagingModule],
  providers: [RabbitmqConsumerRunner, WorkerRuntime],
  exports: [WorkerRuntime, RabbitmqConsumerRunner],
})
export class WorkerModule {}
