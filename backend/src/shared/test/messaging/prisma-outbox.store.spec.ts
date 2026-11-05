import { PrismaOutboxStore } from '../../infrastructure/messaging/persistence/prisma-outbox.store';
import type { PrismaService } from '../../../database/prisma.service';

describe('PrismaOutboxStore (T09, Unit)', () => {
  const tenantId = '51083af7-26d2-4b61-bb7e-9f46b3377811';
  let store: PrismaOutboxStore;
  let mockPrisma: any;
  let mockTx: any;

  beforeEach(() => {
    mockTx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn(),
      outboxEvent: {
        updateMany: jest.fn(),
        findMany: jest.fn(),
      },
    };

    mockPrisma = {
      $transaction: jest.fn(async (cb) => cb(mockTx)),
    };

    store = new PrismaOutboxStore(mockPrisma as unknown as PrismaService);
  });

  describe('claimDue', () => {
    it('debe seleccionar filas con FOR UPDATE SKIP LOCKED y actualizar leaseToken', async () => {
      mockTx.$queryRaw.mockResolvedValueOnce([{ id: 'outbox-1' }]);
      mockTx.outboxEvent.updateMany.mockResolvedValueOnce({ count: 1 });
      mockTx.outboxEvent.findMany.mockResolvedValueOnce([
        {
          id: 'outbox-1',
          tenantId,
          eventId: 'evt-1',
          correlationId: 'corr-1',
          eventType: 'PackageDelivered',
          version: 1,
          payload: { packageId: 'pkg-1' },
          producer: 'sls-backend.deliveries',
          occurredAt: new Date('2026-10-07T15:00:00Z'),
          attempts: 1,
          leaseToken: 'lease-uuid-1',
        },
      ]);

      const records = await store.claimDue({
        tenantId,
        limit: 10,
        leaseDurationMs: 60000,
      });

      expect(mockTx.$queryRaw).toHaveBeenCalled();
      expect(mockTx.outboxEvent.updateMany).toHaveBeenCalledWith({
        where: {
          tenantId,
          id: { in: ['outbox-1'] },
          status: 'PENDING',
        },
        data: expect.objectContaining({
          leaseToken: expect.any(String),
          lockedUntil: expect.any(Date),
          attempts: { increment: 1 },
        }),
      });
      expect(records).toHaveLength(1);
      expect(records[0].id).toBe('outbox-1');
      expect(records[0].producer).toBe('sls-backend.deliveries');
    });

    it('debe devolver array vacío si no hay filas pendientes disponibles', async () => {
      mockTx.$queryRaw.mockResolvedValueOnce([]);

      const records = await store.claimDue({
        tenantId,
        limit: 10,
        leaseDurationMs: 60000,
      });

      expect(records).toEqual([]);
      expect(mockTx.outboxEvent.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('renewLease', () => {
    it('debe actualizar lockedUntil si el leaseToken coincide', async () => {
      mockTx.outboxEvent.updateMany.mockResolvedValueOnce({ count: 1 });

      const success = await store.renewLease(
        tenantId,
        'outbox-1',
        'lease-uuid',
        30000,
      );

      expect(success).toBe(true);
      expect(mockTx.outboxEvent.updateMany).toHaveBeenCalledWith({
        where: {
          tenantId,
          id: 'outbox-1',
          leaseToken: 'lease-uuid',
          status: 'PENDING',
        },
        data: {
          lockedUntil: expect.any(Date),
        },
      });
    });
  });

  describe('markPublished', () => {
    it('debe marcar la fila como PUBLISHED y limpiar el lease', async () => {
      mockTx.outboxEvent.updateMany.mockResolvedValueOnce({ count: 1 });
      const now = new Date('2026-10-07T15:30:00Z');

      const success = await store.markPublished(
        tenantId,
        'outbox-1',
        'lease-uuid',
        now,
      );

      expect(success).toBe(true);
      expect(mockTx.outboxEvent.updateMany).toHaveBeenCalledWith({
        where: {
          tenantId,
          id: 'outbox-1',
          leaseToken: 'lease-uuid',
          status: 'PENDING',
        },
        data: {
          status: 'PUBLISHED',
          publishedAt: now,
          leaseToken: null,
          lockedUntil: null,
          lastError: null,
        },
      });
    });
  });

  describe('failClaim', () => {
    it('debe liberar el lease y reprogramar nextAttemptAt con mensaje de error', async () => {
      mockTx.outboxEvent.updateMany.mockResolvedValueOnce({ count: 1 });
      const nextAttempt = new Date('2026-10-07T15:35:00Z');

      const success = await store.failClaim(
        tenantId,
        'outbox-1',
        'lease-uuid',
        'Broker connection timeout',
        nextAttempt,
      );

      expect(success).toBe(true);
      expect(mockTx.outboxEvent.updateMany).toHaveBeenCalledWith({
        where: {
          tenantId,
          id: 'outbox-1',
          leaseToken: 'lease-uuid',
          status: 'PENDING',
        },
        data: {
          leaseToken: null,
          lockedUntil: null,
          lastError: 'Broker connection timeout',
          nextAttemptAt: nextAttempt,
        },
      });
    });
  });

  describe('markFailedPermanently', () => {
    it('debe marcar la fila como FAILED', async () => {
      mockTx.outboxEvent.updateMany.mockResolvedValueOnce({ count: 1 });

      const success = await store.markFailedPermanently(
        tenantId,
        'outbox-1',
        'lease-uuid',
        'EVENT_INVALID_ENVELOPE',
      );

      expect(success).toBe(true);
      expect(mockTx.outboxEvent.updateMany).toHaveBeenCalledWith({
        where: {
          tenantId,
          id: 'outbox-1',
          leaseToken: 'lease-uuid',
        },
        data: {
          status: 'FAILED',
          leaseToken: null,
          lockedUntil: null,
          lastError: 'EVENT_INVALID_ENVELOPE',
        },
      });
    });
  });
});
