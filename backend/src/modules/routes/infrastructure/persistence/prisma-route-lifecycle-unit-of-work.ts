import { Injectable } from '@nestjs/common';
import {
  OutboxEventStatus,
  Prisma,
} from '../../../../../generated/prisma/client';
import { PrismaService } from '../../../../database/prisma.service';
import { runWithTenant } from '../../../../database/run-with-tenant';
import {
  RouteAuditLogEntry,
  RouteAuditPort,
  RouteLifecycleSession,
  RouteLifecycleUnitOfWork,
  RouteOutboxEventEntry,
  RouteOutboxPort,
} from '../../application/ports/route-lifecycle-unit-of-work';
import { PrismaRouteRepository } from './prisma-route.repository';
import { PrismaPackageStateWriter } from '../../../packages/infrastructure/prisma-package-state-writer';
import { PrismaRouteAssignmentAdapter } from '../../../assignments/infrastructure/prisma-route-assignment.adapter';

@Injectable()
export class PrismaRouteLifecycleUnitOfWork implements RouteLifecycleUnitOfWork {
  private static readonly MAX_ATTEMPTS = 3;

  constructor(private readonly prisma: PrismaService) {}

  async executeInTransaction<T>(
    tenantId: string,
    operation: (session: RouteLifecycleSession) => Promise<T>,
  ): Promise<T> {
    for (
      let attempt = 0;
      attempt < PrismaRouteLifecycleUnitOfWork.MAX_ATTEMPTS;
      attempt++
    ) {
      try {
        return await runWithTenant(
          this.prisma,
          tenantId,
          async (tx) => {
            const routes = new PrismaRouteRepository(this.prisma, tx);
            const packages = new PrismaPackageStateWriter(tx);
            const assignments = new PrismaRouteAssignmentAdapter(tx);

            const audit: RouteAuditPort = {
              recordAuditLog: async (entry: RouteAuditLogEntry) => {
                await tx.auditLog.create({
                  data: {
                    tenantId: entry.tenantId,
                    actorUserId: entry.actorUserId,
                    action: entry.action,
                    entityType: entry.entityType,
                    entityId: entry.entityId,
                    correlationId: entry.correlationId ?? null,
                    metadata: {
                      previousState: entry.previousState,
                      newState: entry.newState,
                      ...(entry.details ?? {}),
                    },
                    createdAt: entry.timestamp,
                  },
                });
              },
            };

            const outbox: RouteOutboxPort = {
              recordEvents: async (
                events: readonly RouteOutboxEventEntry[],
              ) => {
                if (events.length === 0) return;
                await tx.outboxEvent.createMany({
                  data: events.map((e) => ({
                    tenantId: e.tenantId,
                    eventId: e.eventId,
                    correlationId: e.correlationId ?? null,
                    eventType: e.eventType,
                    version: e.version,
                    payload: e.payload as Prisma.InputJsonValue,
                    status: OutboxEventStatus.PENDING,
                    occurredAt: e.occurredAt,
                  })),
                });
              },
            };

            const session: RouteLifecycleSession = {
              routes,
              packages,
              assignments,
              audit,
              outbox,
            };

            return await operation(session);
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          },
        );
      } catch (error: unknown) {
        const isLastAttempt =
          attempt === PrismaRouteLifecycleUnitOfWork.MAX_ATTEMPTS - 1;
        if (isLastAttempt || !this.isRetryableTransactionError(error)) {
          throw error;
        }
      }
    }

    throw new Error('ROUTE_LIFECYCLE_TRANSACTION_RETRY_EXHAUSTED');
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
