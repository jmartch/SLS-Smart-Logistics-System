import { PrismaService } from '../../../database/prisma.service';
import { PrismaRouteLifecycleUnitOfWork } from '../infrastructure/persistence/prisma-route-lifecycle-unit-of-work';
import { Prisma } from '../../../../generated/prisma/client';

describe('PrismaRouteLifecycleUnitOfWork', () => {
  const tenantId = '11111111-1111-1111-1111-111111111111';

  let mockTx: any;
  let mockPrisma: any;
  let unitOfWork: PrismaRouteLifecycleUnitOfWork;

  beforeEach(() => {
    mockTx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
      outboxEvent: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      route: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
      routeStop: {
        upsert: jest.fn(),
      },
      package: {
        updateMany: jest.fn(),
      },
      packageStatusHistory: {
        createMany: jest.fn(),
      },
      assignment: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    mockPrisma = {
      $transaction: jest.fn(async (cb: (tx: any) => Promise<any>) =>
        cb(mockTx),
      ),
      $executeRaw: jest.fn().mockResolvedValue(1),
    };

    unitOfWork = new PrismaRouteLifecycleUnitOfWork(
      mockPrisma as unknown as PrismaService,
    );
  });

  it('executes operation in serializable transaction and returns result', async () => {
    // Arrange
    const expectedResult = { executed: true };
    const operation = jest.fn().mockResolvedValue(expectedResult);

    // Act
    const result = await unitOfWork.executeInTransaction(tenantId, operation);

    // Assert
    expect(result).toBe(expectedResult);
    expect(mockPrisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    expect(operation).toHaveBeenCalledTimes(1);
    const session = operation.mock.calls[0][0];
    expect(session.routes).toBeDefined();
    expect(session.packages).toBeDefined();
    expect(session.assignments).toBeDefined();
    expect(session.audit).toBeDefined();
    expect(session.outbox).toBeDefined();
  });

  it('records audit log entries through audit port in session', async () => {
    // Arrange
    const auditEntry = {
      tenantId,
      actorUserId: 'user-1',
      action: 'ROUTE_PREPARED',
      entityType: 'ROUTE' as const,
      entityId: 'route-1',
      previousState: 'PLANNED',
      newState: 'READY',
      correlationId: 'corr-1',
      timestamp: new Date('2026-10-06T10:00:00Z'),
      details: { depotConfirmed: true },
    };

    // Act
    await unitOfWork.executeInTransaction(tenantId, async (session) => {
      await session.audit.recordAuditLog(auditEntry);
    });

    // Assert
    expect(mockTx.auditLog.create).toHaveBeenCalledWith({
      data: {
        tenantId,
        actorUserId: 'user-1',
        action: 'ROUTE_PREPARED',
        entityType: 'ROUTE',
        entityId: 'route-1',
        correlationId: 'corr-1',
        metadata: {
          previousState: 'PLANNED',
          newState: 'READY',
          depotConfirmed: true,
        },
        createdAt: auditEntry.timestamp,
      },
    });
  });

  it('records outbox events through outbox port in session', async () => {
    // Arrange
    const eventEntry = {
      eventId: 'evt-1',
      tenantId,
      correlationId: 'corr-1',
      eventType: 'RoutePrepared',
      occurredAt: new Date('2026-10-06T10:00:00Z'),
      producer: 'routes',
      version: 1,
      payload: { routeId: 'route-1' },
    };

    // Act
    await unitOfWork.executeInTransaction(tenantId, async (session) => {
      await session.outbox.recordEvents([eventEntry]);
    });

    // Assert
    expect(mockTx.outboxEvent.createMany).toHaveBeenCalledWith({
      data: [
        {
          tenantId,
          eventId: 'evt-1',
          correlationId: 'corr-1',
          eventType: 'RoutePrepared',
          version: 1,
          payload: { routeId: 'route-1' },
          status: 'PENDING',
          occurredAt: eventEntry.occurredAt,
        },
      ],
    });
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
    mockPrisma.$transaction = jest.fn(async (cb: (tx: any) => Promise<any>) => {
      attempts++;
      if (attempts === 1) {
        throw retryableError;
      }
      return cb(mockTx);
    });

    const operation = jest.fn().mockResolvedValue('success-after-retry');

    // Act
    const result = await unitOfWork.executeInTransaction(tenantId, operation);

    // Assert
    expect(result).toBe('success-after-retry');
    expect(attempts).toBe(2);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('does not retry and immediately throws on non-retryable error', async () => {
    // Arrange
    const fatalError = new Error('Database connection failed');
    mockPrisma.$transaction = jest.fn().mockRejectedValue(fatalError);

    const operation = jest.fn();

    // Act & Assert
    await expect(
      unitOfWork.executeInTransaction(tenantId, operation),
    ).rejects.toThrow('Database connection failed');
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('throws exhausted retry error when maximum attempts are exceeded', async () => {
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
    await expect(
      unitOfWork.executeInTransaction(tenantId, jest.fn()),
    ).rejects.toThrow(retryableError);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(3);
  });
});
