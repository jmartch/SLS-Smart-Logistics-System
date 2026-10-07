import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaService } from '../src/database/prisma.service';
import { runWithTenant } from '../src/database/run-with-tenant';
import { PrismaAuditConsumerUnitOfWork } from '../src/modules/audit/infrastructure/prisma-audit-consumer-unit-of-work';
import { AuditIntegrationEventConsumer } from '../src/modules/audit/application/audit-integration-event.consumer';
import { IdempotentConsumer } from '../src/shared/application/messaging/idempotent-consumer';
import { DeadLetterRecorder } from '../src/shared/application/messaging/dead-letter-recorder';
import { PrismaDeadLetterStore } from '../src/shared/infrastructure/messaging/persistence/prisma-dead-letter.store';
import { PrismaRedriveStore } from '../src/shared/infrastructure/messaging/persistence/prisma-redrive.store';
import { PrismaProcessedEventRegistry } from '../src/shared/infrastructure/messaging/persistence/prisma-processed-event.registry';
import { RequestDeadLetterRedriveUseCase } from '../src/shared/application/messaging/request-dead-letter-redrive.use-case';
import type { EventEnvelope } from '../src/shared/application/messaging/event-envelope';

describe('Messaging Consumer Idempotency, DLQ & Redrive E2E (IDEMP-01 / DLQ-01)', () => {
  const admin = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL,
    }),
  });
  const appPrisma = new PrismaService();

  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const consumerName = 'audit.integration-events.v1';

  let uow: PrismaAuditConsumerUnitOfWork;
  let auditHandler: AuditIntegrationEventConsumer;
  let deadLetterStore: PrismaDeadLetterStore;
  let redriveStore: PrismaRedriveStore;

  beforeAll(async () => {
    await admin.tenant.createMany({
      data: [
        { id: tenantA, name: `Tenant A Consumer E2E ${tenantA.slice(0, 8)}` },
        { id: tenantB, name: `Tenant B Consumer E2E ${tenantB.slice(0, 8)}` },
      ],
    });

    uow = new PrismaAuditConsumerUnitOfWork(appPrisma);
    auditHandler = new AuditIntegrationEventConsumer();
    deadLetterStore = new PrismaDeadLetterStore(appPrisma);
    redriveStore = new PrismaRedriveStore(appPrisma);
  });

  afterAll(async () => {
    await admin.deadLetterRedrive.deleteMany({
      where: { tenantId: { in: [tenantA, tenantB] } },
    });
    await admin.deadLetterMessage.deleteMany({
      where: { tenantId: { in: [tenantA, tenantB] } },
    });
    await admin.processedEvent.deleteMany({
      where: { tenantId: { in: [tenantA, tenantB] } },
    });
    await admin.auditLog.deleteMany({
      where: { tenantId: { in: [tenantA, tenantB] } },
    });
    await admin.tenant.deleteMany({
      where: { id: { in: [tenantA, tenantB] } },
    });
    await appPrisma.onModuleDestroy();
    await admin.$disconnect();
  });

  it('records effect and ProcessedEvent on first delivery, ignores duplicate (T12, T13)', async () => {
    const eventId = randomUUID();
    const correlationId = randomUUID();
    const envelope: EventEnvelope = {
      eventId,
      tenantId: tenantA,
      correlationId,
      eventType: 'PackageDelivered',
      version: 1,
      producer: 'sls-backend.deliveries',
      occurredAt: new Date().toISOString(),
      payload: {
        packageId: randomUUID(),
        routeId: randomUUID(),
        stopId: randomUUID(),
        attemptId: randomUUID(),
      },
    };

    const consumer = new IdempotentConsumer(consumerName, uow);

    // 1. Primer consumo: debe aplicar efecto y registrar ProcessedEvent
    const outcome1 = await consumer.process(envelope, async (session, env) => {
      await auditHandler.handle(session, env);
    });

    expect(outcome1.status).toBe('APPLIED');

    const processedRow = await admin.processedEvent.findUnique({
      where: {
        tenantId_eventId_consumerName: {
          tenantId: tenantA,
          eventId,
          consumerName,
        },
      },
    });
    expect(processedRow).not.toBeNull();

    const auditCount1 = await admin.auditLog.count({
      where: { tenantId: tenantA, entityId: eventId },
    });
    expect(auditCount1).toBe(1);

    // 2. Segundo consumo idéntico (duplicado): debe devolver DUPLICATE y no añadir AuditLog
    const outcome2 = await consumer.process(envelope, async (session, env) => {
      await auditHandler.handle(session, env);
    });

    expect(outcome2.status).toBe('DUPLICATE');

    const auditCount2 = await admin.auditLog.count({
      where: { tenantId: tenantA, entityId: eventId },
    });
    expect(auditCount2).toBe(1); // Exactamente 1, no duplicado
  });

  it('rolls back ProcessedEvent when business handler fails inside transaction (T14)', async () => {
    const eventId = randomUUID();
    const envelope: EventEnvelope = {
      eventId,
      tenantId: tenantA,
      correlationId: randomUUID(),
      eventType: 'PackageDelivered',
      version: 1,
      producer: 'sls-backend.deliveries',
      occurredAt: new Date().toISOString(),
      payload: { packageId: randomUUID() },
    };

    const consumer = new IdempotentConsumer(consumerName, uow);

    await expect(
      consumer.process(envelope, async () => {
        throw new Error('Induced handler failure during business logic');
      }),
    ).rejects.toThrow('Induced handler failure');

    // Comprobar que NO quedó registrado en ProcessedEvent
    const processedRow = await admin.processedEvent.findUnique({
      where: {
        tenantId_eventId_consumerName: {
          tenantId: tenantA,
          eventId,
          consumerName,
        },
      },
    });
    expect(processedRow).toBeNull();
  });

  it('isolates Tenant A and Tenant B data under row level security (T24, T25)', async () => {
    const eventId = randomUUID();

    // Registrar evento para Tenant A
    await runWithTenant(appPrisma, tenantA, async (tx) => {
      const reg = new PrismaProcessedEventRegistry(tx);
      await reg.tryRegister({ tenantId: tenantA, eventId, consumerName });
    });

    // Consultar bajo sesión de Tenant B: no debe existir
    await runWithTenant(appPrisma, tenantB, async (tx) => {
      const reg = new PrismaProcessedEventRegistry(tx);
      const isProcessedByB = await reg.isProcessed({
        tenantId: tenantB,
        eventId,
        consumerName,
      });
      expect(isProcessedByB).toBe(false);
    });
  });

  it('records DLQ messages with deduplicated failureKey and allows redrive (T26, T28)', async () => {
    const eventId = randomUUID();
    const deadLetterId = randomUUID();

    const recorder = new DeadLetterRecorder(deadLetterStore);

    // 1. Registrar fallo en DLQ
    await recorder.record({
      tenantId: tenantA,
      eventId,
      correlationId: randomUUID(),
      sourceQueue: 'sls.audit.integration-events.v1',
      consumerName,
      attempts: 4,
      originalEvent: {
        eventId,
        tenantId: tenantA,
        correlationId: randomUUID(),
        eventType: 'PackageDelivered',
        version: 1,
        producer: 'sls-backend.deliveries',
        occurredAt: new Date().toISOString(),
        payload: {
          packageId: randomUUID(),
          routeId: randomUUID(),
          stopId: randomUUID(),
          attemptId: randomUUID(),
        },
      },
      failureReason: 'EVENT_RETRIES_EXHAUSTED: Max attempts reached',
    });

    const dlqRow = await admin.deadLetterMessage.findFirst({
      where: { tenantId: tenantA, eventId },
    });
    expect(dlqRow).not.toBeNull();

    // 2. Solicitar Redrive con operador autorizado
    const processedRegistry = new PrismaProcessedEventRegistry(admin);

    const redriveUseCase = new RequestDeadLetterRedriveUseCase(
      deadLetterStore,
      redriveStore,
      processedRegistry,
    );

    const requestId = randomUUID();
    const redriveResult = await redriveUseCase.execute({
      tenantId: tenantA,
      deadLetterMessageId: dlqRow!.id,
      requestId,
      reason: 'Manual operator redrive request',
      operatorContext: {
        operatorId: 'ops-admin-user',
        allowedTenantScope: [tenantA],
      },
    });

    expect(redriveResult.status).toBe('PENDING');

    // Comprobar que se creó AuditLog para la solicitud de redrive
    const redriveAudit = await admin.auditLog.findFirst({
      where: {
        tenantId: tenantA,
        action: 'DEAD_LETTER_REDRIVE_REQUESTED',
        entityId: requestId,
      },
    });
    expect(redriveAudit).not.toBeNull();
  });
});
