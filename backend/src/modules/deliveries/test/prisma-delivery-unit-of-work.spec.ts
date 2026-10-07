/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import {
  PrismaDeliverySession,
  PrismaDeliveryUnitOfWork,
} from '../infrastructure/persistence/prisma-delivery-unit-of-work';
import { Prisma } from '../../../../generated/prisma/client';

describe('PrismaDeliveryUnitOfWork', () => {
  const tenantId = '11111111-1111-1111-1111-111111111111';

  let mockTx: any;
  let mockPrisma: any;
  let unitOfWork: PrismaDeliveryUnitOfWork;

  beforeEach(() => {
    mockTx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'mock-id' }]),
      deliveryOperation: {
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'op-1' }),
      },
      deliveryAttempt: {
        findFirst: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'att-1' }),
        count: jest.fn().mockResolvedValue(0),
      },
      deliveryEvidence: {
        create: jest.fn().mockResolvedValue({ id: 'evi-1' }),
      },
      deliveryWindow: {
        create: jest.fn().mockResolvedValue({ id: 'win-1' }),
      },
      incident: {
        create: jest.fn().mockResolvedValue({ id: 'inc-1' }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
      outboxEvent: {
        create: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
      },
      route: {
        findUnique: jest.fn(),
      },
      routeStop: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      package: {
        update: jest.fn(),
      },
      assignment: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
    };

    mockPrisma = {
      $transaction: jest.fn(async (cb: (tx: any) => Promise<any>) =>
        cb(mockTx),
      ),
      $executeRaw: jest.fn().mockResolvedValue(1),
    };

    unitOfWork = new PrismaDeliveryUnitOfWork(mockPrisma);
  });

  describe('run', () => {
    it('executes unit of work inside SERIALIZABLE transaction and returns result', async () => {
      // Arrange
      const expectedResult = { executed: true };
      const operation = jest.fn().mockResolvedValue(expectedResult);

      // Act
      const result = await unitOfWork.run(tenantId, operation);

      // Assert
      expect(result).toBe(expectedResult);
      expect(mockPrisma.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
      expect(operation).toHaveBeenCalledTimes(1);
      const session = operation.mock.calls[0][0];
      expect(session).toBeInstanceOf(PrismaDeliverySession);
      expect(session.tenantId).toBe(tenantId);
    });

    it('retries when retryable serialization error occurs and succeeds on retry', async () => {
      // Arrange
      const retryableError = new Prisma.PrismaClientKnownRequestError(
        'Transaction failed due to a write conflict or a deadlock.',
        {
          code: 'P2034',
          clientVersion: '7.0.0',
        },
      );

      let attempts = 0;
      mockPrisma.$transaction = jest.fn(
        async (cb: (tx: any) => Promise<any>) => {
          attempts++;
          if (attempts === 1) {
            throw retryableError;
          }
          return cb(mockTx);
        },
      );

      const operation = jest.fn().mockResolvedValue('success-after-retry');

      // Act
      const result = await unitOfWork.run(tenantId, operation);

      // Assert
      expect(result).toBe('success-after-retry');
      expect(attempts).toBe(2);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('does not retry and immediately throws non-retryable error', async () => {
      // Arrange
      const fatalError = new Error('Database connection failed');
      mockPrisma.$transaction = jest.fn().mockRejectedValue(fatalError);

      const operation = jest.fn();

      // Act & Assert
      await expect(unitOfWork.run(tenantId, operation)).rejects.toThrow(
        'Database connection failed',
      );
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('rethrows retryable error when maximum attempts are exhausted', async () => {
      // Arrange
      const retryableError = new Prisma.PrismaClientKnownRequestError(
        'Transaction write conflict',
        {
          code: 'P2034',
          clientVersion: '7.0.0',
        },
      );
      mockPrisma.$transaction = jest.fn().mockRejectedValue(retryableError);

      // Act & Assert
      await expect(unitOfWork.run(tenantId, jest.fn())).rejects.toThrow(
        retryableError,
      );
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(3);
    });
  });

  describe('PrismaDeliverySession', () => {
    it('records audit log entries through audit table in session', async () => {
      // Arrange
      const session = new PrismaDeliverySession(tenantId, mockTx);
      const auditEntry = {
        tenantId,
        actorUserId: 'user-1',
        action: 'ATTEND_ROUTE_STOP',
        entityType: 'RouteStop',
        entityId: 'stop-1',
        details: { affectedPackages: 2 },
      };

      // Act
      await session.recordAudit(auditEntry);

      // Assert
      expect(mockTx.auditLog.create).toHaveBeenCalledWith({
        data: {
          tenantId,
          actorUserId: 'user-1',
          action: 'ATTEND_ROUTE_STOP',
          entityType: 'RouteStop',
          entityId: 'stop-1',
          metadata: { affectedPackages: 2 },
        },
      });
    });

    it('records outbox events with PENDING status in session', async () => {
      // Arrange
      const session = new PrismaDeliverySession(tenantId, mockTx);
      const outboxMsg = {
        eventId: 'evt-100',
        tenantId,
        correlationId: 'corr-100',
        eventType: 'PackageDelivered',
        producer: 'sls-backend.deliveries',
        version: 1,
        payload: { packageId: 'pkg-1', attemptId: 'att-1' },
        occurredAt: new Date('2026-10-06T10:00:00.000Z'),
      };

      // Act
      await session.recordOutbox(outboxMsg);

      // Assert
      expect(mockTx.outboxEvent.create).toHaveBeenCalledWith({
        data: {
          tenantId,
          eventId: 'evt-100',
          correlationId: 'corr-100',
          eventType: 'PackageDelivered',
          version: 1,
          payload: { packageId: 'pkg-1', attemptId: 'att-1' },
          status: 'PENDING',
          occurredAt: outboxMsg.occurredAt,
          producer: 'sls-backend.deliveries',
        },
      });
    });

    it('saves delivery operation record in session', async () => {
      // Arrange
      const session = new PrismaDeliverySession(tenantId, mockTx);
      const now = new Date('2026-10-06T10:00:00.000Z');
      const operation = {
        id: 'op-100',
        tenantId,
        requestId: 'req-100',
        actorUserId: 'user-1',
        commandType: 'RECORD_SUCCESSFUL_DELIVERY',
        targetId: 'pkg-1',
        requestHash: 'hash-100',
        resultSnapshot: { status: 'DELIVERED' },
        createdAt: now,
      };

      // Act
      await session.saveOperation(operation);

      // Assert
      expect(mockTx.deliveryOperation.create).toHaveBeenCalledWith({
        data: {
          id: 'op-100',
          tenantId,
          requestId: 'req-100',
          actorUserId: 'user-1',
          commandType: 'RECORD_SUCCESSFUL_DELIVERY',
          targetId: 'pkg-1',
          requestHash: 'hash-100',
          resultSnapshot: { status: 'DELIVERED' },
          createdAt: now,
        },
      });
    });
  });
});
