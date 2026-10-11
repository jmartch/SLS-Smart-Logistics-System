import { CloseRouteUseCase } from '../application/use-cases/close-route.use-case';
import {
  CloseRouteCommand,
  computeCloseRouteHash,
} from '../application/ports/route-close-contracts';
import {
  RouteCloseSession,
  RouteCloseUnitOfWork,
  PersistedRouteClosure,
  RouteClosureAuditEntry,
} from '../application/ports/route-close-unit-of-work.port';
import { RouteAccessPort } from '../application/ports/route-access.port';
import { Route } from '../domain/route';
import { RouteState } from '../domain/route-state';
import { RouteStopState } from '../domain/route-stop-state';
import {
  RouteClosureMode,
  RouteManifestOutcome,
  ReconciledManifestMember,
} from '../domain/route-closure.types';
import { RouteClosureSummary } from '../domain/route-closure-summary';
import { RouteDomainEvent, RouteEventType } from '../domain/events/route-lifecycle.event';
import { ManifestDispatchItem } from '../domain/route-manifest-reconciliation.policy';
import {
  RouteNotFoundError,
  RouteForbiddenError,
  RouteAlreadyCompletedError,
  IdempotencyKeyReusedError,
  RouteHasPendingStopsError,
  RouteCustodyUnresolvedError,
} from '../domain/route-errors';
import { createRoutePropsFixture, createRouteStopFixture } from './fixtures/route.fixtures';
import { createSevenPackagesForcedScenarioFixture } from './fixtures/route-closure.fixtures';

class FakeRouteCloseUnitOfWork implements RouteCloseUnitOfWork {
  route: Route | null = null;
  closuresByRouteId = new Map<string, PersistedRouteClosure>();
  closuresByRequestId = new Map<string, PersistedRouteClosure>();
  dispatchManifest: readonly ManifestDispatchItem[] = [];
  operationalFacts: readonly ReconciledManifestMember[] = [];
  stopStates: readonly { readonly stopId: string; readonly state: string }[] = [];
  activeCargoCount = 0;

  savedRoute: Route | null = null;
  savedClosureSummary: RouteClosureSummary | null = null;
  recordedOutboxEvents: RouteDomainEvent[] = [];
  recordedAuditLogs: RouteClosureAuditEntry[] = [];
  confirmedDepotReceipts: {
    depotId: string;
    assignmentIds: string[];
    actorUserId: string;
  }[] = [];
  recoveredPackages: {
    packageIds: string[];
    reasonCode: string;
    actorUserId: string;
  }[] = [];
  endedCargoAssignments: {
    assignmentIds: string[];
    reasonCode: string;
  }[] = [];

  async execute<T>(
    tenantId: string,
    operation: (session: RouteCloseSession) => Promise<T>,
  ): Promise<T> {
    const session: RouteCloseSession = {
      lockAndGetRoute: async (_t, _id) => this.route,
      findClosureByRouteId: async (_t, rId) =>
        this.closuresByRouteId.get(rId) ?? null,
      findClosureByRequestId: async (_t, reqId) =>
        this.closuresByRequestId.get(reqId) ?? null,
      getDispatchManifest: async () => this.dispatchManifest,
      getOperationalFacts: async () => this.operationalFacts,
      getRouteStopStates: async () => this.stopStates,
      getActiveCargoAssignmentCount: async () => this.activeCargoCount,
      confirmDepotReceipt: async (_t, depotId, assignmentIds, actorUserId) => {
        this.confirmedDepotReceipts.push({
          depotId,
          assignmentIds: [...assignmentIds],
          actorUserId,
        });
      },
      recoverUnattendedPackages: async (
        _t,
        packageIds,
        reasonCode,
        actorUserId,
      ) => {
        this.recoveredPackages.push({
          packageIds: [...packageIds],
          reasonCode,
          actorUserId,
        });
      },
      endCargoAssignments: async (_t, assignmentIds, reasonCode) => {
        this.endedCargoAssignments.push({
          assignmentIds: [...assignmentIds],
          reasonCode,
        });
      },
      saveClosure: async (_t, summary, requestHash, requestId) => {
        this.savedClosureSummary = summary;
        const record: PersistedRouteClosure = {
          id: summary.closureId,
          tenantId,
          routeId: summary.routeId,
          requestId,
          actorUserId: summary.actorUserId,
          requestHash,
          mode: summary.mode,
          completedAt: summary.completedAt,
          resultSnapshot: summary.toSnapshot(),
        };
        this.closuresByRouteId.set(summary.routeId, record);
        this.closuresByRequestId.set(requestId, record);
      },
      saveRoute: async (route) => {
        this.savedRoute = route;
      },
      recordOutboxEvents: async (_t, events) => {
        this.recordedOutboxEvents.push(...events);
      },
      recordAuditLog: async (entry) => {
        this.recordedAuditLogs.push(entry);
      },
    };

    return await operation(session);
  }
}

class FakeRouteAccessPort implements RouteAccessPort {
  canClose = true;
  canReceiveDepot = true;
  canViewSummary = true;

  async canPrepareRoute(): Promise<boolean> {
    return true;
  }
  async canStartRoute(): Promise<boolean> {
    return true;
  }
  async canCancelRoute(): Promise<boolean> {
    return true;
  }
  async canInterruptRoute(): Promise<boolean> {
    return true;
  }
  async canViewRoute(): Promise<boolean> {
    return true;
  }
  async getCourierIdForUser(): Promise<string | null> {
    return 'courier-1';
  }
  async canCloseRoute(): Promise<boolean> {
    return this.canClose;
  }
  async canReceiveDepotCargo(): Promise<boolean> {
    return this.canReceiveDepot;
  }
  async canViewRouteSummary(): Promise<boolean> {
    return this.canViewSummary;
  }
}

describe('CloseRouteUseCase (CA-01, CA-06, CA-08, CA-09)', () => {
  let uow: FakeRouteCloseUnitOfWork;
  let accessPort: FakeRouteAccessPort;
  let useCase: CloseRouteUseCase;
  const fixedDate = new Date('2026-10-06T12:00:00.000Z');
  const startedAt = new Date('2026-10-06T08:00:00.000Z');

  beforeEach(() => {
    uow = new FakeRouteCloseUnitOfWork();
    accessPort = new FakeRouteAccessPort();
    useCase = new CloseRouteUseCase(
      uow,
      accessPort,
      () => fixedDate,
      () => 'closure-uuid-1',
    );
  });

  function setupRegularThreeStopsRoute(): Route {
    const stops = [
      createRouteStopFixture({
        id: 'stop-1',
        stopNumber: 1,
        state: RouteStopState.COMPLETED,
      }),
      createRouteStopFixture({
        id: 'stop-2',
        stopNumber: 2,
        state: RouteStopState.COMPLETED,
      }),
      createRouteStopFixture({
        id: 'stop-3',
        stopNumber: 3,
        state: RouteStopState.COMPLETED,
      }),
    ];

    const route = new Route(
      createRoutePropsFixture({
        id: 'route-1',
        tenantId: 'tenant-a',
        state: RouteState.IN_PROGRESS,
        startedAt,
        stops,
      }),
    );

    uow.route = route;
    uow.stopStates = [
      { stopId: 'stop-1', state: RouteStopState.COMPLETED },
      { stopId: 'stop-2', state: RouteStopState.COMPLETED },
      { stopId: 'stop-3', state: RouteStopState.COMPLETED },
    ];
    uow.dispatchManifest = [
      { assignmentId: 'a1', packageId: 'p1', routeStopId: 'stop-1' },
      { assignmentId: 'a2', packageId: 'p2', routeStopId: 'stop-2' },
      { assignmentId: 'a3', packageId: 'p3', routeStopId: 'stop-3' },
    ];
    uow.operationalFacts = [
      {
        assignmentId: 'a1',
        packageId: 'p1',
        routeStopId: 'stop-1',
        outcome: RouteManifestOutcome.DELIVERED,
        receiptConfirmed: false,
      },
      {
        assignmentId: 'a2',
        packageId: 'p2',
        routeStopId: 'stop-2',
        outcome: RouteManifestOutcome.DELIVERED,
        receiptConfirmed: false,
      },
      {
        assignmentId: 'a3',
        packageId: 'p3',
        routeStopId: 'stop-3',
        outcome: RouteManifestOutcome.DELIVERED,
        receiptConfirmed: false,
      },
    ];
    uow.activeCargoCount = 0;

    return route;
  }

  it('completes route successfully in REGULAR mode', async () => {
    setupRegularThreeStopsRoute();

    const command: CloseRouteCommand = {
      tenantId: 'tenant-a',
      routeId: 'route-1',
      requestId: 'req-1',
      actorUserId: 'user-coord',
      correlationId: 'corr-1',
      mode: RouteClosureMode.REGULAR,
      actualDistanceM: 15200.5,
    };

    const result = await useCase.execute(command);

    expect(result.routeId).toBe('route-1');
    expect(result.closureId).toBe('closure-uuid-1');
    expect(result.state).toBe('COMPLETED');
    expect(result.completedAt).toEqual(fixedDate);
    expect(result.replayed).toBe(false);

    expect(uow.savedRoute).not.toBeNull();
    expect(uow.savedRoute!.state).toBe(RouteState.COMPLETED);

    expect(uow.savedClosureSummary).not.toBeNull();
    expect(uow.savedClosureSummary!.totalAssigned).toBe(3);
    expect(uow.savedClosureSummary!.deliveredCount).toBe(3);
    expect(uow.savedClosureSummary!.actualDistanceM).toBe(15200.5);

    expect(uow.recordedOutboxEvents).toHaveLength(1);
    expect(uow.recordedOutboxEvents[0].eventType).toBe(RouteEventType.COMPLETED);

    expect(uow.recordedAuditLogs).toHaveLength(1);
    expect(uow.recordedAuditLogs[0].action).toBe('ROUTE_CLOSED');
    expect(uow.recordedAuditLogs[0].mode).toBe(RouteClosureMode.REGULAR);
  });

  it('handles idempotent replay when called with same requestId and identical content (CA-09)', async () => {
    setupRegularThreeStopsRoute();

    const command: CloseRouteCommand = {
      tenantId: 'tenant-a',
      routeId: 'route-1',
      requestId: 'req-idemp-1',
      actorUserId: 'user-coord',
      correlationId: 'corr-1',
      mode: RouteClosureMode.REGULAR,
      actualDistanceM: 10000,
    };

    const firstResult = await useCase.execute(command);
    expect(firstResult.replayed).toBe(false);

    // Segunda invocación con mismo requestId y mismo comando
    const secondResult = await useCase.execute(command);
    expect(secondResult.replayed).toBe(true);
    expect(secondResult.closureId).toBe(firstResult.closureId);
    expect(secondResult.completedAt).toEqual(firstResult.completedAt);

    // No se duplicaron eventos outbox ni logs de auditoría
    expect(uow.recordedOutboxEvents).toHaveLength(1);
    expect(uow.recordedAuditLogs).toHaveLength(1);
  });

  it('rejects with IdempotencyKeyReusedError when same requestId is used with different content (CA-09)', async () => {
    setupRegularThreeStopsRoute();

    const command: CloseRouteCommand = {
      tenantId: 'tenant-a',
      routeId: 'route-1',
      requestId: 'req-reused-1',
      actorUserId: 'user-coord',
      mode: RouteClosureMode.REGULAR,
      actualDistanceM: 10000,
    };

    await useCase.execute(command);

    const conflictingCommand: CloseRouteCommand = {
      ...command,
      actualDistanceM: 20000, // contenido diferente
    };

    await expect(useCase.execute(conflictingCommand)).rejects.toThrow(
      IdempotencyKeyReusedError,
    );
  });

  it('rejects with RouteAlreadyCompletedError when closing an already completed route with a new key', async () => {
    setupRegularThreeStopsRoute();

    const command1: CloseRouteCommand = {
      tenantId: 'tenant-a',
      routeId: 'route-1',
      requestId: 'req-first',
      actorUserId: 'user-coord',
      mode: RouteClosureMode.REGULAR,
    };

    await useCase.execute(command1);

    const command2: CloseRouteCommand = {
      tenantId: 'tenant-a',
      routeId: 'route-1',
      requestId: 'req-second-different',
      actorUserId: 'user-coord',
      mode: RouteClosureMode.REGULAR,
    };

    await expect(useCase.execute(command2)).rejects.toThrow(
      RouteAlreadyCompletedError,
    );
  });

  it('completes route in FORCED mode with unattended packages recovery and depot receipt (CA-03, CA-06)', async () => {
    const scenario = createSevenPackagesForcedScenarioFixture();

    const stops = [
      createRouteStopFixture({
        id: 'stop-1',
        routeId: scenario.routeId,
        stopNumber: 1,
        state: RouteStopState.COMPLETED,
      }),
      createRouteStopFixture({
        id: 'stop-2',
        routeId: scenario.routeId,
        stopNumber: 2,
        state: RouteStopState.FAILED,
      }),
      createRouteStopFixture({
        id: 'stop-3',
        routeId: scenario.routeId,
        stopNumber: 3,
        state: RouteStopState.FAILED,
      }),
      createRouteStopFixture({
        id: 'stop-4',
        routeId: scenario.routeId,
        stopNumber: 4,
        state: RouteStopState.PENDING,
      }),
    ];

    const route = new Route(
      createRoutePropsFixture({
        id: scenario.routeId,
        tenantId: scenario.tenantId,
        state: RouteState.IN_PROGRESS,
        startedAt,
        stops,
      }),
    );

    uow.route = route;
    uow.stopStates = [
      { stopId: 'stop-1', state: RouteStopState.COMPLETED },
      { stopId: 'stop-2', state: RouteStopState.FAILED },
      { stopId: 'stop-3', state: RouteStopState.FAILED },
      { stopId: 'stop-4', state: RouteStopState.PENDING },
    ];
    uow.dispatchManifest = scenario.manifest;
    uow.operationalFacts = scenario.facts.map((f) => ({
      assignmentId: f.assignmentId,
      packageId: f.packageId,
      routeStopId: f.routeStopId,
      outcome: f.outcome,
      receiptConfirmed: f.physicalReceiptConfirmed,
      depotId: f.physicalReceiptDepotId,
      failureReasonCode: f.failureReasonCode,
    }));
    uow.activeCargoCount = 0;

    const command: CloseRouteCommand = {
      tenantId: scenario.tenantId,
      routeId: scenario.routeId,
      requestId: 'req-forced-1',
      actorUserId: 'user-coord',
      mode: RouteClosureMode.FORCED,
      reasonCode: 'VEHICLE_BREAKDOWN',
      notes: 'Vehicle broke down; cargo received at depot.',
      depotReceipt: {
        depotId: 'depot-1',
        physicalReceiptConfirmed: true,
        assignmentIds: ['asg-3', 'asg-4', 'asg-5', 'asg-6', 'asg-7'],
      },
    };

    const result = await useCase.execute(command);

    expect(result.state).toBe('COMPLETED');
    expect(result.replayed).toBe(false);

    // Se confirmó la recepción física en depósito
    expect(uow.confirmedDepotReceipts).toHaveLength(1);
    expect(uow.confirmedDepotReceipts[0].depotId).toBe('depot-1');

    // Se recuperaron los paquetes no atendidos (pkg-6 y pkg-7)
    expect(uow.recoveredPackages).toHaveLength(1);
    expect(uow.recoveredPackages[0].packageIds).toEqual(['pkg-6', 'pkg-7']);

    // Se terminaron las asignaciones de los paquetes recuperados
    expect(uow.endedCargoAssignments).toHaveLength(1);
    expect(uow.endedCargoAssignments[0].assignmentIds).toEqual(['asg-6', 'asg-7']);

    // Balance exacto persistido
    expect(uow.savedClosureSummary!.totalAssigned).toBe(7);
    expect(uow.savedClosureSummary!.pendingCount).toBe(2);
    expect(uow.savedClosureSummary!.deliveredCount).toBe(2);
  });

  it('rejects closure if actor is not authorized (CA-01)', async () => {
    setupRegularThreeStopsRoute();
    accessPort.canClose = false;

    const command: CloseRouteCommand = {
      tenantId: 'tenant-a',
      routeId: 'route-1',
      requestId: 'req-unauth',
      actorUserId: 'user-unauthorized',
      mode: RouteClosureMode.REGULAR,
    };

    await expect(useCase.execute(command)).rejects.toThrow(RouteForbiddenError);
  });

  it('rejects closure if depot cargo receipt is included but actor lacks permission (CA-01)', async () => {
    setupRegularThreeStopsRoute();
    accessPort.canReceiveDepot = false;

    const command: CloseRouteCommand = {
      tenantId: 'tenant-a',
      routeId: 'route-1',
      requestId: 'req-unauth-depot',
      actorUserId: 'user-coord',
      mode: RouteClosureMode.FORCED,
      reasonCode: 'VEHICLE_BREAKDOWN',
      notes: 'Mechanical failure',
      depotReceipt: {
        depotId: 'depot-1',
        physicalReceiptConfirmed: true,
        assignmentIds: ['a1'],
      },
    };

    await expect(useCase.execute(command)).rejects.toThrow(RouteForbiddenError);
    await expect(useCase.execute(command)).rejects.toThrow(/depot receipt/i);
  });

  it('rejects if route does not exist', async () => {
    uow.route = null;

    const command: CloseRouteCommand = {
      tenantId: 'tenant-a',
      routeId: 'route-nonexistent',
      requestId: 'req-404',
      actorUserId: 'user-coord',
      mode: RouteClosureMode.REGULAR,
    };

    await expect(useCase.execute(command)).rejects.toThrow(RouteNotFoundError);
  });

  it('rejects REGULAR closure if any stop remains pending (CA-03)', async () => {
    setupRegularThreeStopsRoute();
    uow.stopStates = [
      { stopId: 'stop-1', state: RouteStopState.COMPLETED },
      { stopId: 'stop-2', state: RouteStopState.PENDING }, // parada pendiente
      { stopId: 'stop-3', state: RouteStopState.COMPLETED },
    ];

    const command: CloseRouteCommand = {
      tenantId: 'tenant-a',
      routeId: 'route-1',
      requestId: 'req-pending-stops',
      actorUserId: 'user-coord',
      mode: RouteClosureMode.REGULAR,
    };

    await expect(useCase.execute(command)).rejects.toThrow(
      RouteHasPendingStopsError,
    );
  });

  it('rejects closure if cargo remains active without depot receipt (CA-06)', async () => {
    setupRegularThreeStopsRoute();
    uow.activeCargoCount = 1; // 1 paquete con custodia activa sin recibir

    const command: CloseRouteCommand = {
      tenantId: 'tenant-a',
      routeId: 'route-1',
      requestId: 'req-custody-fail',
      actorUserId: 'user-coord',
      mode: RouteClosureMode.REGULAR,
    };

    await expect(useCase.execute(command)).rejects.toThrow(
      RouteCustodyUnresolvedError,
    );
  });
});
