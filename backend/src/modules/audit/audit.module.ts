import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { PrismaAuditConsumerUnitOfWork } from './infrastructure/prisma-audit-consumer-unit-of-work';
import { AuditIntegrationEventConsumer } from './application/audit-integration-event.consumer';

@Module({
  imports: [PrismaModule],
  providers: [PrismaAuditConsumerUnitOfWork, AuditIntegrationEventConsumer],
  exports: [PrismaAuditConsumerUnitOfWork, AuditIntegrationEventConsumer],
})
export class AuditModule {}
