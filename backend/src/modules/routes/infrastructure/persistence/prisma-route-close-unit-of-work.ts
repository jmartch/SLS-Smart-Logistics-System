import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../../generated/prisma/client';
import { PrismaService } from '../../../../database/prisma.service';
import { runWithTenant } from '../../../../database/run-with-tenant';
import { Route } from '../../domain/route';
import { RouteState } from '../../domain/route-state';
import { RouteClosureSummary } from '../../domain/route-closure-summary';
import { RouteDomainEvent } from '../../domain/events/route-lifecycle.event';
import {
    RouteClosureMode,
    RouteManifestOutcome,
    ReconciledManifestMember,
} from '../../domain/route-closure.types';
import { ManifestDispatchItem } from '../../domain/route-manifest-reconciliation.policy';
import {
    PersistedRouteClosure,
    RouteClosureAuditEntry,
    RouteCloseSession,
    RouteCloseUnitOfWork,
} from '../../application/ports/route-close-unit-of-work.port';
import { RoutePersistenceMapper } from './route-persistence.mapper';
import { RouteConcurrencyConflictError } from '../../domain/route-errors';

export class PrismaRouteCloseSession implements RouteCloseSession {
    constructor(private readonly tx: Prisma.TransactionClient) { }

    async lockAndGetRoute(
        tenantId: string,
        routeId: string,
    ): Promise<Route | null> {
        const lockedRows = await this.tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Route"
      WHERE "tenantId" = ${tenantId}::uuid AND id = ${routeId}::uuid
      FOR UPDATE
    `;
        if (lockedRows.length === 0) {
            return null;
        }

        const raw = await this.tx.route.findUnique({
            where: {
                tenantId_id: {
                    tenantId,
                    id: routeId,
                },
            },
            include: {
                stops: {
                    orderBy: { sequence: 'asc' },
                },
            },
        });

        return raw ? RoutePersistenceMapper.toDomain(raw) : null;
    }

    async findClosureByRouteId(
        tenantId: string,
        routeId: string,
    ): Promise<PersistedRouteClosure | null> {
        const raw = await this.tx.routeClosure.findUnique({
            where: {
                tenantId_routeId: {
                    tenantId,
                    routeId,
                },
            },
        });

        if (!raw) return null;

        return {
            id: raw.id,
            tenantId: raw.tenantId,
            routeId: raw.routeId,
            requestId: raw.requestId,
            actorUserId: raw.actorUserId,
            requestHash: raw.requestHash,
            mode: raw.mode as RouteClosureMode,
            completedAt: raw.completedAt,
            resultSnapshot: raw.resultSnapshot as Record<string, unknown>,
        };
    }

    async findClosureByRequestId(
        tenantId: string,
        requestId: string,
    ): Promise<PersistedRouteClosure | null> {
        const raw = await this.tx.routeClosure.findUnique({
            where: {
                tenantId_requestId: {
                    tenantId,
                    requestId,
                },
            },
        });

        if (!raw) return null;

        return {
            id: raw.id,
            tenantId: raw.tenantId,
            routeId: raw.routeId,
            requestId: raw.requestId,
            actorUserId: raw.actorUserId,
            requestHash: raw.requestHash,
            mode: raw.mode as RouteClosureMode,
            completedAt: raw.completedAt,
            resultSnapshot: raw.resultSnapshot as Record<string, unknown>,
        };
    }

    async getDispatchManifest(
        tenantId: string,
        routeId: string,
    ): Promise<readonly ManifestDispatchItem[]> {
        const route = await this.tx.route.findUnique({
            where: {
                tenantId_id: {
                    tenantId,
                    id: routeId,
                },
            },
            select: {
                dispatchManifestSnapshot: true,
            },
        });

        if (route?.dispatchManifestSnapshot) {
            const snapshot = route.dispatchManifestSnapshot as {
                members?: readonly {
                    assignmentId: string;
                    packageId: string;
                    routeStopId: string;
                }[];
            };
            if (Array.isArray(snapshot.members) && snapshot.members.length > 0) {
                return snapshot.members.map((m) => ({
                    assignmentId: m.assignmentId,
                    packageId: m.packageId,
                    routeStopId: m.routeStopId,
                }));
            }
        }

        const assignments = await this.tx.assignment.findMany({
            where: {
                tenantId,
                routeId,
                routeStopId: { not: null },
            },
            orderBy: { id: 'asc' },
            select: {
                id: true,
                packageId: true,
                routeStopId: true,
            },
        });

        return assignments
            .filter((a): a is { id: string; packageId: string; routeStopId: string } =>
                Boolean(a.routeStopId),
            )
            .map((a) => ({
                assignmentId: a.id,
                packageId: a.packageId,
                routeStopId: a.routeStopId,
            }));
    }

    async getOperationalFacts(
        tenantId: string,
        routeId: string,
    ): Promise<readonly ReconciledManifestMember[]> {
        const assignments = await this.tx.assignment.findMany({
            where: { tenantId, routeId },
            include: {
                package: { select: { state: true } },
                deliveryAttempts: {
                    where: { tenantId },
                    orderBy: { attemptNumber: 'desc' },
                },
            },
            orderBy: { id: 'asc' },
        });

        return assignments.map((a) => {
            const attempts = a.deliveryAttempts ?? [];
            const hasDeliveredAttempt = attempts.some(
                (att) => att.outcome === 'DELIVERED',
            );
            const hasFailedAttempt = attempts.some((att) => att.outcome === 'FAILED');
            const hasRescheduledAttempt = attempts.some(
                (att) => att.outcome === 'RESCHEDULED',
            );

            const isDelivered =
                a.routeOutcome === RouteManifestOutcome.DELIVERED ||
                a.package.state === 'DELIVERED' ||
                hasDeliveredAttempt;

            const isReturnedToDepot =
                a.routeOutcome === RouteManifestOutcome.RETURNED ||
                a.package.state === 'RETURNED' ||
                a.package.state === 'RETURN_PENDING';

            const isRescheduled =
                a.routeOutcome === RouteManifestOutcome.RESCHEDULED ||
                a.package.state === 'RESCHEDULED' ||
                hasRescheduledAttempt;

            let outcome: RouteManifestOutcome;
            if (a.routeOutcome) {
                outcome = a.routeOutcome as RouteManifestOutcome;
            } else if (isDelivered) {
                outcome = RouteManifestOutcome.DELIVERED;
            } else if (isReturnedToDepot) {
                outcome = RouteManifestOutcome.RETURNED;
            } else if (isRescheduled) {
                outcome = RouteManifestOutcome.RESCHEDULED;
            } else if (hasFailedAttempt) {
                outcome = RouteManifestOutcome.FAILED;
            } else {
                outcome = RouteManifestOutcome.PENDING;
            }

            const latestFailedAttempt = attempts.find(
                (att) => att.outcome === 'FAILED',
            );
            const failureReasonCode =
                latestFailedAttempt?.failureReasonCode ?? a.reasonCode ?? null;
            const receiptConfirmed = Boolean(a.receivedAtDepotId);
            const depotId = a.receivedAtDepotId ?? null;

            return {
                assignmentId: a.id,
                packageId: a.packageId,
                routeStopId: a.routeStopId ?? '',
                outcome,
                failureReasonCode,
                receiptConfirmed,
                depotId,
            };
        });
    }

    async getRouteStopStates(
        tenantId: string,
        routeId: string,
    ): Promise<readonly { readonly stopId: string; readonly state: string }[]> {
        const stops = await this.tx.routeStop.findMany({
            where: { tenantId, routeId },
            orderBy: { sequence: 'asc' },
            select: { id: true, state: true },
        });
        return stops.map((s) => ({ stopId: s.id, state: s.state }));
    }

    async getActiveCargoAssignmentCount(
        tenantId: string,
        routeId: string,
    ): Promise<number> {
        return await this.tx.assignment.count({
            where: {
                tenantId,
                routeId,
                status: 'ACTIVE',
                receivedAtDepotId: null,
            },
        });
    }

    async confirmDepotReceipt(
        tenantId: string,
        depotId: string,
        assignmentIds: readonly string[],
        actorUserId: string,
        receivedAt: Date,
    ): Promise<void> {
        if (assignmentIds.length === 0) return;
        await this.tx.assignment.updateMany({
            where: {
                tenantId,
                id: { in: [...assignmentIds] },
            },
            data: {
                receivedAtDepotId: depotId,
                receivedAtDepotAt: receivedAt,
                receivedByUserId: actorUserId,
            },
        });
    }

    async recoverUnattendedPackages(
        tenantId: string,
        packageIds: readonly string[],
        reasonCode: string,
        actorUserId: string,
        recoveredAt: Date,
    ): Promise<void> {
        if (packageIds.length === 0) return;
        for (const packageId of packageIds) {
            const pkg = await this.tx.package.findUnique({
                where: { tenantId_id: { tenantId, id: packageId } },
                select: { state: true },
            });
            if (pkg) {
                await this.tx.package.update({
                    where: { tenantId_id: { tenantId, id: packageId } },
                    data: { state: 'PENDING_ASSIGNMENT' },
                });
                await this.tx.packageStatusHistory.create({
                    data: {
                        tenantId,
                        packageId,
                        fromState: pkg.state,
                        toState: 'PENDING_ASSIGNMENT',
                        reasonCode,
                        changedByUserId: actorUserId,
                        createdAt: recoveredAt,
                    },
                });
            }
        }
    }

    async endCargoAssignments(
        tenantId: string,
        assignmentIds: readonly string[],
        reasonCode: string,
        endedAt: Date,
    ): Promise<void> {
        if (assignmentIds.length === 0) return;
        await this.tx.assignment.updateMany({
            where: {
                tenantId,
                id: { in: [...assignmentIds] },
            },
            data: {
                status: 'ENDED',
                endedAt,
                reasonCode,
            },
        });
    }

    async saveClosure(
        tenantId: string,
        summary: RouteClosureSummary,
        requestHash: string,
        requestId: string,
    ): Promise<void> {
        await this.tx.routeClosure.create({
            data: {
                id: summary.closureId,
                tenantId,
                routeId: summary.routeId,
                requestId,
                actorUserId: summary.actorUserId,
                requestHash,
                mode: summary.mode,
                reasonCode: summary.reasonCode ?? null,
                notes: summary.notes ?? null,
                completedAt: summary.completedAt,
                schemaVersion: summary.schemaVersion,
                totalAssigned: summary.totalAssigned,
                deliveredCount: summary.deliveredCount,
                failedCount: summary.failedCount,
                rescheduledCount: summary.rescheduledCount,
                returnedCount: summary.returnedCount,
                pendingCount: summary.pendingCount,
                resultSnapshot: summary.toSnapshot() as Prisma.InputJsonValue,
            },
        });
    }

    async saveRoute(route: Route): Promise<void> {
        await this.tx.route.update({
            where: {
                tenantId_id: {
                    tenantId: route.tenantId,
                    id: route.id,
                },
            },
            data: {
                state: route.state,
                completedAt: route.completedAt ?? null,
            },
        });

        if (route.state === RouteState.COMPLETED) {
            await this.tx.assignment.updateMany({
                where: {
                    tenantId: route.tenantId,
                    routeId: route.id,
                    status: 'ACTIVE',
                },
                data: {
                    status: 'ENDED',
                    endedAt: route.completedAt ?? new Date(),
                    reasonCode: 'ROUTE_COMPLETED',
                },
            });
        }
    }

    async recordOutboxEvents(
        tenantId: string,
        events: readonly RouteDomainEvent[],
    ): Promise<void> {
        if (events.length === 0) return;
        await this.tx.outboxEvent.createMany({
            data: events.map((e) => ({
                tenantId,
                eventId: e.eventId,
                correlationId: (e as any).metadata?.correlationId ?? null,
                eventType: e.eventType,
                producer: e.producer ?? 'routes',
                version: e.version,
                payload: { ...e } as unknown as Prisma.InputJsonValue,
                status: 'PENDING',
                occurredAt: e.occurredAt,
            })),
        });
    }

    async recordAuditLog(entry: RouteClosureAuditEntry): Promise<void> {
        await this.tx.auditLog.create({
            data: {
                tenantId: entry.tenantId,
                actorUserId: entry.actorUserId,
                action: entry.action,
                entityType: 'ROUTE',
                entityId: entry.routeId,
                correlationId: entry.correlationId ?? null,
                metadata: {
                    closureId: entry.closureId,
                    previousState: entry.previousState,
                    newState: entry.newState,
                    mode: entry.mode,
                    reasonCode: entry.reasonCode ?? null,
                    requestId: entry.requestId,
                    requestHash: entry.requestHash,
                    ...(entry.details ?? {}),
                },
                createdAt: entry.timestamp,
            },
        });
    }
}

@Injectable()
export class PrismaRouteCloseUnitOfWork implements RouteCloseUnitOfWork {
    private static readonly MAX_ATTEMPTS = 3;

    constructor(private readonly prisma: PrismaService) { }

    async execute<T>(
        tenantId: string,
        operation: (session: RouteCloseSession) => Promise<T>,
    ): Promise<T> {
        for (
            let attempt = 0;
            attempt < PrismaRouteCloseUnitOfWork.MAX_ATTEMPTS;
            attempt++
        ) {
            try {
                return await runWithTenant(
                    this.prisma,
                    tenantId,
                    async (tx) => {
                        const session = new PrismaRouteCloseSession(tx);
                        return await operation(session);
                    },
                    {
                        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
                    },
                );
            } catch (error: unknown) {
                const isLastAttempt =
                    attempt === PrismaRouteCloseUnitOfWork.MAX_ATTEMPTS - 1;
                if (isLastAttempt || !this.isRetryableTransactionError(error)) {
                    if (isLastAttempt && this.isRetryableTransactionError(error)) {
                        throw new RouteConcurrencyConflictError(
                            'Route close transaction failed after maximum retries due to concurrent modifications. Please retry with the same Idempotency-Key.',
                        );
                    }
                    throw error;
                }

                const delayMs =
                    25 * Math.pow(2, attempt) + Math.floor(Math.random() * 25);
                await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
        }

        throw new RouteConcurrencyConflictError(
            'Route close transaction failed after maximum retries due to concurrent modifications.',
        );
    }

    private isRetryableTransactionError(error: unknown): boolean {
        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2034'
        ) {
            return true;
        }

        const code = (error as { code?: string })?.code;
        return code === '40001' || code === '40P01';
    }
}