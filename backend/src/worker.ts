import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';
import { WorkerRuntime } from './shared/infrastructure/messaging/worker-runtime';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: ['error', 'warn', 'log'],
  });

  const runtime = app.get(WorkerRuntime);
  await runtime.start();
  process.stdout.write(
    'SLS worker started (RabbitMQ topology ready, consumer active, outbox polling active).\n',
  );

  const shutdown = async (signal: string) => {
    process.stdout.write(`Received ${signal}, shutting down worker...\n`);
    await runtime.stop();
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void bootstrap();
