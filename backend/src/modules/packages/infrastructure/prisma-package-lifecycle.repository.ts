import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { runWithTenant } from '../../../database/run-with-tenant';
import {
    PackageLifecycleRepository,
    type LockedPackageIdentity,
    type PackageLifecycleOperation,
    type PackageLifecycleResult,
} from '../domain/package-lifecycle.repository';
import { PackageAggregate } from '../domain/package.aggregate';
import type { PackageStateName } from '../domain/package-state.types';

interface LockedPackageRow {
    readonly id: string;
    readonly tenantId: string;
    readonly state: PackageStateName;
}

@Injectable()
export class PrismaPackageLifecycleRepository
    extends PackageLifecycleRepository {
    constructor(private readonly prisma: PrismaService) {
        super();
    }

    transitionAtomically(
        identity: LockedPackageIdentity,
        operation: PackageLifecycleOperation,
    ): Promise<PackageLifecycleResult> {
        return runWithTenant(
            this.prisma,
            identity.tenantId,
            async (transaction) => {
                const rows = await transaction.$queryRaw<LockedPackageRow[]>`
                    SELECT id, "tenantId", state
                    FROM "Package"
                    WHERE "tenantId" = ${identity.tenantId}::uuid
                      AND id = ${identity.packageId}::uuid
                    FOR UPDATE
                `;

                const [row] = rows;

                if (!row) {
                    return { kind: 'NOT_FOUND' };
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
                        id: identity.packageId,
                        tenantId: identity.tenantId,
                        state: event.fromState,
                    },
                    data: {
                        state: event.toState,
                    },
                });

                if (updated.count !== 1) {
                    throw new Error(
                        'Package state changed while applying the transition',
                    );
                }

                await transaction.packageStatusHistory.create({
                    data: {
                        tenantId: identity.tenantId,
                        packageId: identity.packageId,
                        fromState: event.fromState,
                        toState: event.toState,
                        reasonCode: event.reasonCode,
                        changedByUserId: event.changedByUserId,
                        createdAt: event.occurredAt,
                    },
                });

                await transaction.outboxEvent.create({
                    data: {
                        tenantId: identity.tenantId,
                        eventId: randomUUID(),
                        correlationId: event.correlationId,
                        eventType: event.eventType,
                        version: event.version,
                        occurredAt: event.occurredAt,
                        payload: {
                            producer: 'sls-backend.packages',
                            packageId: event.aggregateId,
                            fromState: event.fromState,
                            toState: event.toState,
                            changedByUserId:
                                event.changedByUserId ?? null,
                            reasonCode: event.reasonCode ?? null,
                        },
                    },
                });

                return {
                    kind: 'TRANSITIONED',
                    event,
                };
            },
        );
    }
}