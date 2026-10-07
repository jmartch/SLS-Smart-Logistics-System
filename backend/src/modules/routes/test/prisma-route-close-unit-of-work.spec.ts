import { PrismaService } from '../../../database/prisma.service';
import {
    PrismaRouteCloseUnitOfWork,
    PrismaRouteCloseSession,
} from '../infrastructure/persistence/prisma-route-close-unit-of-work';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaRouteSummaryReader } from '../infrastructure/persistence/prisma-route-summary-reader';
import {
    RouteClosureMode,
    RouteManifestOutcome,
    RouteClosureDisposition,
} from '../domain/route-closure.types';
import { RouteClosureSummary } from '../domain/route-closure-summary';
import { RouteConcurrencyConflictError } from '../domain/route-errors';
import { RouteState } from '../domain/route-state';
import { Route } from '../domain/route';

describe('PrismaRouteCloseUnitOfWork & Reader', () => {
    const tenantId = '11111111-1111-1111-1111-111111111111';
    const routeId = '22222222-2222-2222-2222-222222222222';
    const requestId = '33333333-3333-3333-3333-333333333333';
    const actorUserId = '44444444-4444-4444-4444-444444444444';

    let mockTx: any;
    let mockPrisma: any;
    let unitOfWork: PrismaRouteCloseUnitOfWork;

    beforeEach(() => {
        mockTx = {
            $queryRaw: jest.fn().mockResolvedValue([{ id: routeId }]),
            $executeRaw: jest.fn().mockResolvedValue(1),
            route: {
                findUnique: jest.fn(),
                update: jest.fn().mockResolvedValue({ id: routeId }),
            },
            routeStop: {
                findMany: jest.fn().mockResolvedValue([]),
            },
            routeClosure: {
                findUnique: jest.fn(),
                create: jest.fn().mockResolvedValue({ id: 'closure-1' }),
            },
            assignment: {
                findMany: jest.fn().mockResolvedValue([]),
                count: jest.fn().mockResolvedValue(0),
                updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            package: {
                findUnique: jest.fn(),
                update: jest.fn().mockResolvedValue({ id: 'pkg-1' }),
            },
            packageStatusHistory: {
                create: jest.fn().mockResolvedValue({ id: 'hist-1' }),
            },
            outboxEvent: {
                createMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            auditLog: {
                create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
            },
        };

        mockPrisma = {
            $transaction: jest.fn(async (cb: (tx: any) => Promise<any>) => cb(mockTx)),
            $executeRaw: jest.fn().mockResolvedValue(1),
            routeClosure: {
                findUnique: jest.fn(),
            },
        };

        unitOfWork = new PrismaRouteCloseUnitOfWork(
            mockPrisma as unknown as PrismaService,
        );
    });

    describe('execute', () => {
        it('executes operation inside SERIALIZABLE transaction', async () => {
            const operation = jest.fn().mockResolvedValue({ closed: true });

            const result = await unitOfWork.execute(tenantId, operation);

            expect(result).toEqual({ closed: true });
            expect(mockPrisma.$transaction).toHaveBeenCalledWith(
                expect.any(Function),
                {
                    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
                },
            );
            expect(operation).toHaveBeenCalledTimes(1);
        });

        it('retries on retryable P2034 error and succeeds on 2nd attempt', async () => {
            const p2034Error = new Prisma.PrismaClientKnownRequestError(
                'Transaction failed',
                { code: 'P2034', clientVersion: '7.10.0' },
            );

            let attempts = 0;
            mockPrisma.$transaction = jest.fn(async (cb: (tx: any) => Promise<any>) => {
                attempts++;
                if (attempts === 1) {
                    throw p2034Error;
                }
                return cb(mockTx);
            });

            const operation = jest.fn().mockResolvedValue('ok');

            const result = await unitOfWork.execute(tenantId, operation);

            expect(result).toBe('ok');
            expect(attempts).toBe(2);
            expect(operation).toHaveBeenCalledTimes(1);
        });

        it('throws RouteConcurrencyConflictError when retry attempts are exhausted', async () => {
            const serializationError = { code: '40001', message: 'could not serialize access' };

            mockPrisma.$transaction = jest.fn(async () => {
                throw serializationError;
            });

            const operation = jest.fn();

            await expect(unitOfWork.execute(tenantId, operation)).rejects.toThrow(
                RouteConcurrencyConflictError,
            );
            expect(mockPrisma.$transaction).toHaveBeenCalledTimes(3);
        });

        it('does not retry non-retryable errors and fails immediately', async () => {
            const domainError = new Error('INVALID_DATA');
            mockPrisma.$transaction = jest.fn(async () => {
                throw domainError;
            });

            const operation = jest.fn();

            await expect(unitOfWork.execute(tenantId, operation)).rejects.toThrow(
                'INVALID_DATA',
            );
            expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
        });
    });

    describe('PrismaRouteCloseSession operations', () => {
        let session: PrismaRouteCloseSession;

        beforeEach(() => {
            session = new PrismaRouteCloseSession(mockTx);
        });

        it('locks route with FOR UPDATE and returns domain aggregate', async () => {
            mockTx.route.findUnique.mockResolvedValue({
                id: routeId,
                tenantId,
                planningRequestId: 'req-1',
                vehicleId: 'veh-1',
                courierId: 'cour-1',
                state: 'IN_PROGRESS',
                plannedAt: new Date('2026-10-06T08:00:00Z'),
                stops: [
                    {
                        id: 'stop-1',
                        tenantId,
                        routeId,
                        sequence: 1,
                        latitude: 10.98,
                        longitude: -74.78,
                        state: 'COMPLETED',
                    },
                ],
            });

            const route = await session.lockAndGetRoute(tenantId, routeId);

            expect(mockTx.$queryRaw).toHaveBeenCalled();
            expect(route).toBeInstanceOf(Route);
            expect(route?.id).toBe(routeId);
            expect(route?.stops).toHaveLength(1);
        });

        it('findClosureByRouteId maps persisted record correctly', async () => {
            const now = new Date();
            mockTx.routeClosure.findUnique.mockResolvedValue({
                id: 'close-1',
                tenantId,
                routeId,
                requestId,
                actorUserId,
                requestHash: 'hash-abc',
                mode: 'REGULAR',
                completedAt: now,
                resultSnapshot: { totalAssigned: 3 },
            });

            const closure = await session.findClosureByRouteId(tenantId, routeId);

            expect(closure).toEqual({
                id: 'close-1',
                tenantId,
                routeId,
                requestId,
                actorUserId,
                requestHash: 'hash-abc',
                mode: RouteClosureMode.REGULAR,
                completedAt: now,
                resultSnapshot: { totalAssigned: 3 },
            });
        });

        it('confirms depot receipt by updating assignments', async () => {
            const receivedAt = new Date();
            await session.confirmDepotReceipt(
                tenantId,
                'depot-1',
                ['assign-1', 'assign-2'],
                actorUserId,
                receivedAt,
            );

            expect(mockTx.assignment.updateMany).toHaveBeenCalledWith({
                where: {
                    tenantId,
                    id: { in: ['assign-1', 'assign-2'] },
                },
                data: {
                    receivedAtDepotId: 'depot-1',
                    receivedAtDepotAt: receivedAt,
                    receivedByUserId: actorUserId,
                },
            });
        });

        it('recovers unattended packages to PENDING_ASSIGNMENT with status history', async () => {
            const recoveredAt = new Date();
            mockTx.package.findUnique.mockResolvedValue({ state: 'IN_TRANSIT' });

            await session.recoverUnattendedPackages(
                tenantId,
                ['pkg-1'],
                'ROUTE_CLOSURE_FORCED',
                actorUserId,
                recoveredAt,
            );

            expect(mockTx.package.update).toHaveBeenCalledWith({
                where: { tenantId_id: { tenantId, id: 'pkg-1' } },
                data: { state: 'PENDING_ASSIGNMENT' },
            });
            expect(mockTx.packageStatusHistory.create).toHaveBeenCalledWith({
                data: {
                    tenantId,
                    packageId: 'pkg-1',
                    fromState: 'IN_TRANSIT',
                    toState: 'PENDING_ASSIGNMENT',
                    reasonCode: 'ROUTE_CLOSURE_FORCED',
                    changedByUserId: actorUserId,
                    createdAt: recoveredAt,
                },
            });
        });

        it('saves route closure with exact count fields and snapshot', async () => {
            const summary = new RouteClosureSummary({
                closureId: 'closure-1',
                tenantId,
                routeId,
                actorUserId,
                mode: RouteClosureMode.REGULAR,
                startedAt: new Date('2026-10-06T10:00:00Z'),
                completedAt: new Date('2026-10-06T15:00:00Z'),
                plannedDistanceM: 5000,
                totalAssigned: 1,
                deliveredCount: 1,
                failedCount: 0,
                rescheduledCount: 0,
                returnedCount: 0,
                pendingCount: 0,
                members: [
                    {
                        assignmentId: 'a-1',
                        packageId: 'p-1',
                        routeStopId: 's-1',
                        outcome: RouteManifestOutcome.DELIVERED,
                        receiptConfirmed: false,
                    },
                ],
                stops: [
                    {
                        routeStopId: 's-1',
                        stopNumber: 1,
                        stopState: 'COMPLETED',
                        disposition: RouteClosureDisposition.VISITED,
                    },
                ],
            });

            await session.saveClosure(tenantId, summary, 'hash-xyz', requestId);

            expect(mockTx.routeClosure.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    id: 'closure-1',
                    tenantId,
                    routeId,
                    requestId,
                    actorUserId,
                    requestHash: 'hash-xyz',
                    mode: RouteClosureMode.REGULAR,
                    totalAssigned: 1,
                    deliveredCount: 1,
                    failedCount: 0,
                    pendingCount: 0,
                }),
            });
        });
    });

    describe('PrismaRouteSummaryReader', () => {
        it('returns snapshot when closure exists', async () => {
            const reader = new PrismaRouteSummaryReader(
                mockPrisma as unknown as PrismaService,
            );
            mockTx.routeClosure.findUnique.mockResolvedValue({
                resultSnapshot: { totalAssigned: 5, effectiveness: 1 },
            });

            const summary = await reader.findSummaryByRouteId(tenantId, routeId);

            expect(summary).toEqual({ totalAssigned: 5, effectiveness: 1 });
            expect(mockTx.routeClosure.findUnique).toHaveBeenCalledWith({
                where: {
                    tenantId_routeId: {
                        tenantId,
                        routeId,
                    },
                },
                select: {
                    resultSnapshot: true,
                },
            });
        });

        it('returns null when closure does not exist', async () => {
            const reader = new PrismaRouteSummaryReader(
                mockPrisma as unknown as PrismaService,
            );
            mockTx.routeClosure.findUnique.mockResolvedValue(null);

            const summary = await reader.findSummaryByRouteId(tenantId, routeId);

            expect(summary).toBeNull();
        });
    });
});