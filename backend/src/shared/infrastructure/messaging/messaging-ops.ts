import { NestFactory } from '@nestjs/core';
import { WorkerModule } from '../../../worker.module';
import { PrismaDeadLetterStore } from './persistence/prisma-dead-letter.store';
import { PrismaRedriveStore } from './persistence/prisma-redrive.store';
import { PrismaProcessedEventRegistry } from './persistence/prisma-processed-event.registry';
import { PrismaService } from '../../../database/prisma.service';
import { RequestDeadLetterRedriveUseCase } from '../../application/messaging/request-dead-letter-redrive.use-case';
import { loadMessagingConfig } from './messaging.config';

export async function runMessagingOps(
  args = process.argv.slice(2),
): Promise<void> {
  const command = args[0];

  if (!command || command === '--help' || command === 'help') {
    process.stdout.write(`
Smart Logistics System (SLS) - Messaging Operations CLI

Commands:
  redrive --tenantId <UUID> --deadLetterId <UUID> --requestId <UUID> --reason <REASON>
  status  --tenantId <UUID> --deadLetterId <UUID>
\n`);
    return;
  }

  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: false,
  });

  const prisma = app.get(PrismaService);
  const deadLetterStore = app.get(PrismaDeadLetterStore);
  const redriveStore = app.get(PrismaRedriveStore);
  const config = loadMessagingConfig();

  const getArg = (name: string): string | undefined => {
    const idx = args.indexOf(`--${name}`);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const tenantId = getArg('tenantId');
  const deadLetterId = getArg('deadLetterId');
  const requestId = getArg('requestId');
  const reason = getArg('reason') || 'Manual operator redrive';

  if (!tenantId || !deadLetterId) {
    process.stderr.write(
      'Error: --tenantId and --deadLetterId are required.\n',
    );
    await app.close();
    process.exitCode = 1;
    return;
  }

  const operatorContext = {
    operatorId: process.env.USER || 'sls-operator-cli',
    allowedTenantScope: config.allowedTenantIds,
  };

  try {
    if (command === 'redrive') {
      if (!requestId) {
        process.stderr.write(
          'Error: --requestId is required for redrive command.\n',
        );
        process.exitCode = 1;
        return;
      }

      const processedRegistry = new PrismaProcessedEventRegistry(prisma);
      const useCase = new RequestDeadLetterRedriveUseCase(
        deadLetterStore,
        redriveStore,
        processedRegistry,
      );

      const result = await useCase.execute({
        tenantId,
        deadLetterMessageId: deadLetterId,
        requestId,
        reason,
        operatorContext,
      });

      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else if (command === 'status') {
      const record = await deadLetterStore.findById(tenantId, deadLetterId);
      if (!record) {
        process.stdout.write(
          `Dead letter message not found for tenant ${tenantId}.\n`,
        );
      } else {
        process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
      }
    }
  } catch (err: unknown) {
    process.stderr.write(
      `Operation failed: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  void runMessagingOps();
}
