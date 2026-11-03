import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import {
    isValidTenantId,
    runWithTenant,
} from '../../../database/run-with-tenant';
import type {
    ClassifyPackageOutcome,
    PackageClassificationContext,
    PackageClassificationPort,
} from '../application/ports/package-classification.port';
import type { PackageClassificationData } from '../domain/package-classification';
import type { PackageLifecycleOperation } from '../domain/package-lifecycle.repository';
import type { PackageClassificationReferenceSnapshot } from '../domain/package-reference.policy';
import { PackageAggregate } from '../domain/package.aggregate';
import type { PackageStateName } from '../domain/package-state.types';

interface LockedPackageClassificationRow {
    readonly id: string;
    readonly tenantId: string;
    readonly trackingCode: string;
    readonly state: PackageStateName;
}

@Injectable()
export class PrismaPackageClassificationAdapter implements PackageClassificationPort {
    constructor(private readonly prisma: PrismaService) {}

    async loadClassificationReferences(
        tenantId: string,
        query: PackageClassificationData,
    ): Promise<PackageClassificationReferenceSnapshot> {
        return runWithTenant(this.prisma, tenantId, async (tx) => {
            const zone = await tx.zone.findFirst({
                where: { tenantId, id: query.zoneId },
                select: { id: true },
            });

            const sector =
                query.sectorId === null
                    ? null
                    : await tx.sector.findFirst({
                          where: { tenantId, id: query.sectorId },
                          select: { zoneId: true },
                      });

            return { zone, sector };
        });
    }

    async classifyAtomically(
        context: PackageClassificationContext,
        packageId: string,
        data: PackageClassificationData,
        operation: PackageLifecycleOperation,
    ): Promise<ClassifyPackageOutcome> {
        return runWithTenant(
            this.prisma,
            context.tenantId,
            async (transaction) => {
                const rows = await transaction.$queryRaw<
                    LockedPackageClassificationRow[]
                >`
                    SELECT id, "tenantId", "trackingCode", state
                    FROM "Package"
                    WHERE "tenantId" = ${context.tenantId}::uuid
                      AND id = ${packageId}::uuid
                    FOR UPDATE
                `;

                const [row] = rows;

                if (!row) {
                    return { ok: false, code: 'PACKAGE_NOT_FOUND' };
                }

                const packageAggregate = PackageAggregate.reconstitute({
                    id: row.id,
                    tenantId: row.tenantId,
                    state: row.state,
                });

                operation(packageAggregate);

                const events = packageAggregate.pullDomainEvents();

                if (events.length !== 1) {
                    throw new Error(
                        `Expected one package transition event, received ${events.length}`,
                    );
                }

                const [event] = events;

                if (!event) {
                    throw new Error('Package transition event is missing');
                }

                const updated = await transaction.package.updateMany({
                    where: {
                        id: packageId,
                        tenantId: context.tenantId,
                        state: event.fromState,
                    },
                    data: {
                        state: event.toState,
                        zoneId: data.zoneId,
                        sectorId: data.sectorId,
                    },
                });

                if (updated.count !== 1) {
                    throw new Error(
                        'Package state changed while applying the classification',
                    );
                }

                await transaction.packageStatusHistory.create({
                    data: {
                        tenantId: context.tenantId,
                        packageId,
                        fromState: event.fromState,
                        toState: event.toState,
                        reasonCode: event.reasonCode,
                        changedByUserId: event.changedByUserId,
                        createdAt: event.occurredAt,
                    },
                });

                const eventId = randomUUID();
                const correlationId =
                    event.correlationId && isValidTenantId(event.correlationId)
                        ? event.correlationId
                        : eventId;

                await transaction.outboxEvent.create({
                    data: {
                        tenantId: context.tenantId,
                        eventId,
                        correlationId,
                        eventType: event.eventType,
                        version: event.version,
                        occurredAt: event.occurredAt,
                        producer: 'sls-backend.packages',
                        payload: {
                            producer: 'sls-backend.packages',
                            packageId: event.aggregateId,
                            fromState: event.fromState,
                            toState: event.toState,
                            zoneId: data.zoneId,
                            sectorId: data.sectorId,
                            changedByUserId: event.changedByUserId ?? null,
                            reasonCode: event.reasonCode ?? null,
                        },
                    },
                });

                return {
                    ok: true,
                    package: {
                        id: row.id,
                        tenantId: row.tenantId,
                        trackingCode: row.trackingCode,
                        state: event.toState,
                        zoneId: data.zoneId,
                        sectorId: data.sectorId,
                    },
                };
            },
        );
    }
}
