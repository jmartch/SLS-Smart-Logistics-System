import { PrismaDeadLetterStore } from '../../infrastructure/messaging/persistence/prisma-dead-letter.store';
import type { PrismaService } from '../../../database/prisma.service';

describe('PrismaDeadLetterStore (DLQ-01, Unit)', () => {
  const tenantId = '51083af7-26d2-4b61-bb7e-9f46b3377811';
  let store: PrismaDeadLetterStore;
  let mockPrisma: any;
  let mockTx: any;

  beforeEach(() => {
    mockTx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      deadLetterMessage: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
      },
    };

    mockPrisma = {
      $transaction: jest.fn(async (cb) => cb(mockTx)),
    };

    store = new PrismaDeadLetterStore(mockPrisma as unknown as PrismaService);
  });

  it('debe registrar un fallo mediante upsert seguro por failureKey', async () => {
    mockTx.deadLetterMessage.upsert.mockResolvedValueOnce({ id: 'dlq-1' });

    await store.recordFailure({
      tenantId,
      eventId: 'evt-1',
      correlationId: 'corr-1',
      sourceQueue: 'sls.audit.integration-events.v1',
      consumerName: 'audit.integration-events.v1',
      attempts: 4,
      originalEvent: { foo: 'bar' },
      failureReason: 'EVENT_RETRIES_EXHAUSTED',
      failureKey: 'sha256-hash-key',
    });

    expect(mockTx.deadLetterMessage.upsert).toHaveBeenCalledWith({
      where: { failureKey: 'sha256-hash-key' },
      create: expect.objectContaining({
        tenantId,
        eventId: 'evt-1',
        failureKey: 'sha256-hash-key',
        attempts: 4,
      }),
      update: {},
    });
  });

  it('debe consultar un mensaje por tenantId e id', async () => {
    mockTx.deadLetterMessage.findUnique.mockResolvedValueOnce({
      id: 'dlq-1',
      tenantId,
      eventId: 'evt-1',
      correlationId: 'corr-1',
      sourceQueue: 'sls.audit.integration-events.v1',
      consumerName: 'audit.integration-events.v1',
      attempts: 4,
      originalEvent: { foo: 'bar' },
      failureReason: 'EVENT_RETRIES_EXHAUSTED',
      failedAt: new Date('2026-10-07T15:00:00Z'),
      failureKey: 'sha256-hash-key',
      transportMetadata: null,
    });

    const record = await store.findById(tenantId, 'dlq-1');

    expect(record).not.toBeNull();
    expect(record?.id).toBe('dlq-1');
    expect(record?.tenantId).toBe(tenantId);
    expect(mockTx.deadLetterMessage.findUnique).toHaveBeenCalledWith({
      where: {
        tenantId_id: { tenantId, id: 'dlq-1' },
      },
    });
  });
});
