import { PrismaRedriveStore } from '../../infrastructure/messaging/persistence/prisma-redrive.store';
import type { PrismaService } from '../../../database/prisma.service';

describe('PrismaRedriveStore (Redrive, Unit)', () => {
  const tenantId = '51083af7-26d2-4b61-bb7e-9f46b3377811';
  let store: PrismaRedriveStore;
  let mockPrisma: any;
  let mockTx: any;

  beforeEach(() => {
    mockTx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn(),
      deadLetterRedrive: {
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      deadLetterMessage: {
        update: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
    };

    mockPrisma = {
      $transaction: jest.fn(async (cb) => cb(mockTx)),
    };

    store = new PrismaRedriveStore(mockPrisma as unknown as PrismaService);
  });

  it('debe crear una solicitud de redrive y registrar la auditoría atómicamente', async () => {
    const now = new Date('2026-10-07T15:00:00Z');
    mockTx.deadLetterRedrive.create.mockResolvedValueOnce({
      id: 'redrive-1',
      tenantId,
      deadLetterMessageId: 'dlq-1',
      consumerName: 'audit.integration-events.v1',
      requestedBy: 'operator-1',
      reason: 'Transient fix applied',
      requestedAt: now,
      status: 'PENDING',
      attempts: 0,
      nextAttemptAt: now,
    });

    const result = await store.createRequest({
      id: 'redrive-1',
      tenantId,
      deadLetterMessageId: 'dlq-1',
      consumerName: 'audit.integration-events.v1',
      requestedBy: 'operator-1',
      reason: 'Transient fix applied',
    });

    expect(result.id).toBe('redrive-1');
    expect(mockTx.deadLetterRedrive.create).toHaveBeenCalled();
    expect(mockTx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId,
        action: 'DEAD_LETTER_REDRIVE_REQUESTED',
        entityId: 'redrive-1',
      }),
    });
  });

  it('debe marcar una solicitud como PUBLISHED y actualizar redrivenAt en la tabla DLQ', async () => {
    mockTx.deadLetterRedrive.findUnique.mockResolvedValueOnce({
      id: 'redrive-1',
      tenantId,
      deadLetterMessageId: 'dlq-1',
      consumerName: 'audit.integration-events.v1',
      leaseToken: 'lease-uuid',
      status: 'PENDING',
    });

    const success = await store.markPublished(
      tenantId,
      'redrive-1',
      'lease-uuid',
    );

    expect(success).toBe(true);
    expect(mockTx.deadLetterRedrive.update).toHaveBeenCalledWith({
      where: { tenantId_id: { tenantId, id: 'redrive-1' } },
      data: expect.objectContaining({ status: 'PUBLISHED' }),
    });
    expect(mockTx.deadLetterMessage.update).toHaveBeenCalled();
    expect(mockTx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId,
        action: 'DEAD_LETTER_REDRIVE_PUBLISHED',
      }),
    });
  });
});
