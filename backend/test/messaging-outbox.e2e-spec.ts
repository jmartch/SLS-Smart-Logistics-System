import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaService } from '../src/database/prisma.service';
import { PrismaOutboxStore } from '../src/shared/infrastructure/messaging/persistence/prisma-outbox.store';
import { OutboxPublisher } from '../src/shared/application/messaging/outbox-publisher';
import type { EventPublisherPort } from '../src/shared/application/messaging/ports/event-publisher.port';

describe('Messaging Outbox, Leases & Concurrency E2E (RMQ-01 / EVT-01)', () => {
  const admin = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL,
    }),
  });
  const appPrisma = new PrismaService();

  const tenantId = randomUUID();
  let outboxStore: PrismaOutboxStore;
  let mockPublisher: jest.Mocked<EventPublisherPort>;

  beforeAll(async () => {
    // Crear Tenant para pruebas
    await admin.tenant.create({
      data: {
        id: tenantId,
        name: `Tenant RMQ Outbox E2E ${tenantId.slice(0, 8)}`,
      },
    });

    outboxStore = new PrismaOutboxStore(appPrisma);
  });

  afterAll(async () => {
    await admin.outboxEvent.deleteMany({ where: { tenantId } });
    await admin.tenant.deleteMany({ where: { id: tenantId } });
    await appPrisma.onModuleDestroy();
    await admin.$disconnect();
  });

  beforeEach(() => {
    mockPublisher = {
      publish: jest.fn().mockResolvedValue(undefined),
    };
  });

  it('claims pending outbox events, publishes via transport, and marks PUBLISHED (T06, T08)', async () => {
    const eventId = randomUUID();
    const correlationId = randomUUID();
    const packageId = randomUUID();
    const routeId = randomUUID();
    const stopId = randomUUID();
    const attemptId = randomUUID();

    // Insertar evento en Outbox usando admin client
    await admin.outboxEvent.create({
      data: {
        tenantId,
        eventId,
        correlationId,
        eventType: 'PackageDelivered',
        version: 1,
        producer: 'sls-backend.deliveries',
        payload: { packageId, routeId, stopId, attemptId },
        status: 'PENDING',
        occurredAt: new Date(),
      },
    });

    const publisher = new OutboxPublisher(outboxStore, mockPublisher, {
      allowedTenantIds: [tenantId],
      batchSize: 10,
      leaseDurationMs: 30000,
    });

    const result = await publisher.publishPendingEvents(tenantId);

    expect(result.claimed).toBe(1);
    expect(result.published).toBe(1);
    expect(result.failedPermanently).toBe(0);

    expect(mockPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId,
        tenantId,
        eventType: 'PackageDelivered',
        producer: 'sls-backend.deliveries',
      }),
    );

    const updated = await admin.outboxEvent.findUnique({
      where: { eventId },
    });

    expect(updated?.status).toBe('PUBLISHED');
    expect(updated?.publishedAt).not.toBeNull();
    expect(updated?.leaseToken).toBeNull();
    expect(updated?.lockedUntil).toBeNull();
  });

  it('prevents concurrent double claims via FOR UPDATE SKIP LOCKED leases (T09)', async () => {
    const eventId = randomUUID();

    await admin.outboxEvent.create({
      data: {
        tenantId,
        eventId,
        eventType: 'PackageDelivered',
        version: 1,
        producer: 'sls-backend.deliveries',
        payload: {
          packageId: randomUUID(),
          routeId: randomUUID(),
          stopId: randomUUID(),
          attemptId: randomUUID(),
        },
        status: 'PENDING',
        occurredAt: new Date(),
      },
    });

    // Claim 1
    const claim1 = await outboxStore.claimDue({
      tenantId,
      limit: 10,
      leaseDurationMs: 60000,
    });

    expect(claim1.length).toBe(1);
    expect(claim1[0].eventId).toBe(eventId);
    const token1 = claim1[0].leaseToken;
    expect(token1).toBeDefined();

    // Claim 2 concurrente (debe estar bloqueado / saltado)
    const claim2 = await outboxStore.claimDue({
      tenantId,
      limit: 10,
      leaseDurationMs: 60000,
    });

    expect(claim2.length).toBe(0);

    // Liberar o marcar publicado con token1
    const published = await outboxStore.markPublished(
      tenantId,
      claim1[0].id,
      token1,
    );
    expect(published).toBe(true);
  });

  it('re-claims abandoned events after lease expires (T09)', async () => {
    const eventId = randomUUID();

    // Crear evento con lease vencido en el pasado
    const record = await admin.outboxEvent.create({
      data: {
        tenantId,
        eventId,
        eventType: 'PackageDelivered',
        version: 1,
        producer: 'sls-backend.deliveries',
        payload: {
          packageId: randomUUID(),
          routeId: randomUUID(),
          stopId: randomUUID(),
          attemptId: randomUUID(),
        },
        status: 'PENDING',
        leaseToken: randomUUID(),
        lockedUntil: new Date(Date.now() - 10000), // Expirado hace 10s
        occurredAt: new Date(),
      },
    });

    const claimed = await outboxStore.claimDue({
      tenantId,
      limit: 10,
      leaseDurationMs: 30000,
    });

    expect(claimed.length).toBe(1);
    expect(claimed[0].id).toBe(record.id);

    await outboxStore.markPublished(tenantId, record.id, claimed[0].leaseToken);
  });

  it('marks permanently failed when payload contains unrecoverable identity contradiction (T17)', async () => {
    const eventId = randomUUID();

    await admin.outboxEvent.create({
      data: {
        tenantId,
        eventId,
        eventType: 'PackageDelivered',
        version: 1,
        producer: 'sls-backend.deliveries',
        payload: {
          tenantId: randomUUID(), // Contradicción con columna tenantId
          packageId: randomUUID(),
        },
        status: 'PENDING',
        occurredAt: new Date(),
      },
    });

    const publisher = new OutboxPublisher(outboxStore, mockPublisher, {
      allowedTenantIds: [tenantId],
      batchSize: 10,
      leaseDurationMs: 30000,
    });

    const result = await publisher.publishPendingEvents(tenantId);

    expect(result.claimed).toBe(1);
    expect(result.published).toBe(0);
    expect(result.failedPermanently).toBe(1);

    const record = await admin.outboxEvent.findUnique({ where: { eventId } });
    expect(record?.status).toBe('FAILED');
    expect(record?.lastError).toContain('Contradiction');
  });
});
