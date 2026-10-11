import { randomUUID } from 'crypto';
import { RouteState } from '../../domain/route-state';
import { RouteStopState } from '../../domain/route-stop-state';
import { RouteClosureDisposition, RouteManifestOutcome } from '../../domain/route-closure.types';
import { RouteClosureSummary } from '../../domain/route-closure-summary';
import { RouteClosurePolicy } from '../../domain/route-closure.policy';
import { RouteManifestReconciliationPolicy } from '../../domain/route-manifest-reconciliation.policy';
import {
    RouteNotFoundError,
    RouteForbiddenError,
    RouteAlreadyCompletedError,
    IdempotencyKeyReusedError,
} from '../../domain/route-errors';
import { RouteAccessPort } from '../ports/route-access.port';
import {
    RouteCloseUnitOfWork,
} from '../ports/route-close-unit-of-work.port';
import {
    CloseRouteCommand,
    CloseRouteResult,
    computeCloseRouteHash,
} from '../ports/route-close-contracts';

export class CloseRouteUseCase {
    constructor(
        private readonly unitOfWork: RouteCloseUnitOfWork,
        private readonly accessPort: RouteAccessPort,
        private readonly clock: () => Date = () => new Date(),
        private readonly idGenerator: () => string = randomUUID,
    ) { }

    async execute(command: CloseRouteCommand): Promise<CloseRouteResult> {
        const canClose = await this.accessPort.canCloseRoute(
            command.tenantId,
            command.actorUserId,
            command.mode,
        );
        if (!canClose) {
            throw new RouteForbiddenError(
                'Actor is not authorized to close this route',
            );
        }

        if (command.depotReceipt) {
            const canReceive = await this.accessPort.canReceiveDepotCargo(
                command.tenantId,
                command.actorUserId,
            );
            if (!canReceive) {
                throw new RouteForbiddenError(
                    'Actor is not authorized to confirm depot receipt of remaining cargo',
                );
            }
        }

        const requestHash = computeCloseRouteHash(command);

        return await this.unitOfWork.execute(
            command.tenantId,
            async (session) => {
                // 1. Bloquear y verificar ruta
                const route = await session.lockAndGetRoute(
                    command.tenantId,
                    command.routeId,
                );
                if (!route) {
                    throw new RouteNotFoundError(command.routeId);
                }

                // 2. Comprobar Idempotencia por requestId
                const existingClosureByRequest = await session.findClosureByRequestId(
                    command.tenantId,
                    command.requestId,
                );
                if (existingClosureByRequest) {
                    if (existingClosureByRequest.requestHash === requestHash) {
                        return {
                            routeId: existingClosureByRequest.routeId,
                            closureId: existingClosureByRequest.id,
                            state: 'COMPLETED',
                            completedAt: existingClosureByRequest.completedAt,
                            summary: existingClosureByRequest.resultSnapshot,
                            replayed: true,
                        };
                    }
                    throw new IdempotencyKeyReusedError(command.requestId);
                }

                // 3. Comprobar si ya está cerrada con otra clave
                const existingClosureByRoute = await session.findClosureByRouteId(
                    command.tenantId,
                    command.routeId,
                );
                if (existingClosureByRoute) {
                    throw new RouteAlreadyCompletedError(command.routeId);
                }

                const now = this.clock();

                // 4. Procesar confirmación de depósito si viene en el comando
                if (command.depotReceipt && command.depotReceipt.physicalReceiptConfirmed) {
                    await session.confirmDepotReceipt(
                        command.tenantId,
                        command.depotReceipt.depotId,
                        command.depotReceipt.assignmentIds,
                        command.actorUserId,
                        now,
                    );
                }

                // 5. Cargar hechos, paradas y verificar custodia
                const stopStates = await session.getRouteStopStates(
                    command.tenantId,
                    command.routeId,
                );
                const pendingActiveCargo = await session.getActiveCargoAssignmentCount(
                    command.tenantId,
                    command.routeId,
                );

                RouteClosurePolicy.validateClosureEligibility({
                    routeId: route.id,
                    currentState: route.state,
                    startedAt: route.startedAt,
                    mode: command.mode,
                    reasonCode: command.reasonCode,
                    notes: command.notes,
                    stopStates,
                    pendingActiveCargoAssignmentsCount: pendingActiveCargo,
                });

                // 6. Reconciliar manifiesto de despacho
                const dispatchManifest = await session.getDispatchManifest(
                    command.tenantId,
                    command.routeId,
                );
                const operationalFacts = await session.getOperationalFacts(
                    command.tenantId,
                    command.routeId,
                );

                const reconciled = RouteManifestReconciliationPolicy.reconcile({
                    routeId: route.id,
                    dispatchManifest,
                    membersWithOutcomes: operationalFacts,
                });

                // 7. Recuperar paquetes no atendidos en cierre forzado
                const pendingMembers = reconciled.members.filter(
                    (m) => m.outcome === RouteManifestOutcome.PENDING,
                );
                if (pendingMembers.length > 0) {
                    const packageIds = pendingMembers.map((m) => m.packageId);
                    const assignmentIds = pendingMembers.map((m) => m.assignmentId);
                    const reason = command.reasonCode ?? 'ROUTE_FORCED_CLOSURE';

                    await session.recoverUnattendedPackages(
                        command.tenantId,
                        packageIds,
                        reason,
                        command.actorUserId,
                        now,
                    );

                    await session.endCargoAssignments(
                        command.tenantId,
                        assignmentIds,
                        reason,
                        now,
                    );
                }

                // 8. Construir detalle de paradas para el snapshot
                const stopDetails = route.stops.map((stop) => {
                    const matchingState = stopStates.find((s) => s.stopId === stop.id);
                    const currentState = matchingState ? matchingState.state : stop.state;
                    let disposition: RouteClosureDisposition = RouteClosureDisposition.VISITED;

                    if (currentState === RouteStopState.PENDING || currentState === 'PENDING') {
                        const stopMembers = reconciled.members.filter(
                            (m) => m.routeStopId === stop.id,
                        );
                        const hasAttended = stopMembers.some(
                            (m) => m.outcome !== RouteManifestOutcome.PENDING,
                        );
                        disposition = hasAttended
                            ? RouteClosureDisposition.PARTIALLY_VISITED
                            : RouteClosureDisposition.NOT_VISITED;
                    }

                    return {
                        routeStopId: stop.id,
                        stopNumber: stop.stopNumber,
                        stopState: currentState,
                        disposition,
                    };
                });


                // 9. Construir Value Object inmutable del resumen
                const closureId = this.idGenerator();
                const summary = new RouteClosureSummary({
                    closureId,
                    tenantId: command.tenantId,
                    routeId: route.id,
                    mode: command.mode,
                    actorUserId: command.actorUserId,
                    correlationId: command.correlationId,
                    reasonCode: command.reasonCode,
                    notes: command.notes,
                    startedAt: route.startedAt!,
                    completedAt: now,
                    totalAssigned: reconciled.totalAssigned,
                    deliveredCount: reconciled.deliveredCount,
                    failedCount: reconciled.failedCount,
                    rescheduledCount: reconciled.rescheduledCount,
                    returnedCount: reconciled.returnedCount,
                    pendingCount: reconciled.pendingCount,
                    plannedDistanceM: (route as any).plannedDistanceM ?? 0,
                    actualDistanceM: command.actualDistanceM,
                    members: reconciled.members,
                    stops: stopDetails,
                    failureReasons: [],
                    incidents: [],
                });

                // 10. Completar la entidad Route
                const previousState = route.state;
                route.complete(summary, {
                    eventId: this.idGenerator(),
                    actorUserId: command.actorUserId,
                    correlationId: command.correlationId ?? undefined,
                });

                // 11. Persistir atómicamente todo en la sesión
                await session.saveClosure(
                    command.tenantId,
                    summary,
                    requestHash,
                    command.requestId,
                );
                await session.saveRoute(route);

                const domainEvents = route.pullDomainEvents();
                await session.recordOutboxEvents(command.tenantId, domainEvents);

                await session.recordAuditLog({
                    tenantId: command.tenantId,
                    actorUserId: command.actorUserId,
                    action: 'ROUTE_CLOSED',
                    routeId: route.id,
                    closureId,
                    previousState,
                    newState: RouteState.COMPLETED,
                    mode: command.mode,
                    reasonCode: command.reasonCode,
                    requestId: command.requestId,
                    requestHash,
                    correlationId: command.correlationId,
                    timestamp: now,
                });

                return {
                    routeId: route.id,
                    closureId,
                    state: 'COMPLETED',
                    completedAt: now,
                    summary: summary.toSnapshot(),
                    replayed: false,
                };
            },
        );
    }
}