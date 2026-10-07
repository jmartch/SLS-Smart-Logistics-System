import { RouteState } from '../domain/route-state';
import { RouteStopState } from '../domain/route-stop-state';
import { RouteClosureMode, RouteManifestOutcome, RouteClosureDisposition } from '../domain/route-closure.types';
import { RouteClosureSummary } from '../domain/route-closure-summary';
import { RouteClosurePolicy } from '../domain/route-closure.policy';
import { RouteManifestReconciliationPolicy } from '../domain/route-manifest-reconciliation.policy';
import { Route } from '../domain/route';
import { RouteEventType, RouteCompletedEvent } from '../domain/events/route-lifecycle.event';
import {
  RouteStateConflictError,
  RouteValidationError,
  RouteHasPendingStopsError,
  RouteCustodyUnresolvedError,
  RouteManifestEmptyError,
  RouteManifestInconsistentError,
} from '../domain/route-errors';
import { createRoutePropsFixture, createRouteStopFixture } from './fixtures/route.fixtures';
import {
  createSevenPackagesForcedScenarioFixture,
  createRegularAllDeliveredScenarioFixture,
} from './fixtures/route-closure.fixtures';
import { PackageAggregate } from '../../packages/domain/package.aggregate';
import { PackageStatus } from '../../packages/domain/package-state.types';
import { InvalidPackageTransitionError } from '../../packages/domain/invalid-package-transition.error';

describe('ROUTE-CLOSE-01: Pure Domain Layer', () => {
  const startedAt = new Date('2026-10-06T08:00:00.000Z');
  const completedAt = new Date('2026-10-06T12:30:00.000Z');

  function createSummaryFixture(overrides?: Partial<any>): RouteClosureSummary {
    return new RouteClosureSummary({
      closureId: 'closure-1',
      tenantId: 'tenant-a',
      routeId: 'route-1',
      mode: RouteClosureMode.REGULAR,
      actorUserId: 'user-coord',
      correlationId: 'corr-1',
      reasonCode: null,
      notes: null,
      startedAt,
      completedAt,
      totalAssigned: 3,
      deliveredCount: 3,
      failedCount: 0,
      rescheduledCount: 0,
      returnedCount: 0,
      pendingCount: 0,
      plannedDistanceM: 10000,
      actualDistanceM: 12500,
      members: [
        {
          assignmentId: 'asg-1',
          packageId: 'pkg-1',
          routeStopId: 'stop-1',
          outcome: RouteManifestOutcome.DELIVERED,
          receiptConfirmed: false,
        },
        {
          assignmentId: 'asg-2',
          packageId: 'pkg-2',
          routeStopId: 'stop-2',
          outcome: RouteManifestOutcome.DELIVERED,
          receiptConfirmed: false,
        },
        {
          assignmentId: 'asg-3',
          packageId: 'pkg-3',
          routeStopId: 'stop-3',
          outcome: RouteManifestOutcome.DELIVERED,
          receiptConfirmed: false,
        },
      ],
      stops: [
        {
          routeStopId: 'stop-1',
          stopNumber: 1,
          stopState: RouteStopState.COMPLETED,
          disposition: RouteClosureDisposition.VISITED,
        },
        {
          routeStopId: 'stop-2',
          stopNumber: 2,
          stopState: RouteStopState.COMPLETED,
          disposition: RouteClosureDisposition.VISITED,
        },
        {
          routeStopId: 'stop-3',
          stopNumber: 3,
          stopState: RouteStopState.COMPLETED,
          disposition: RouteClosureDisposition.VISITED,
        },
      ],
      failureReasons: [],
      incidents: [],
      ...overrides,
    });
  }

  describe('Route.complete() Lifecycle Transition (CA-02, CA-05, CA-11)', () => {
    it('successfully transitions from IN_PROGRESS to COMPLETED and emits RouteCompletedEvent', () => {
      const route = new Route(
        createRoutePropsFixture({
          id: 'route-1',
          tenantId: 'tenant-a',
          state: RouteState.IN_PROGRESS,
          startedAt,
        }),
      );

      const summary = createSummaryFixture();
      route.complete(summary, {
        actorUserId: 'user-coord',
        correlationId: 'corr-1',
      });

      expect(route.state).toBe(RouteState.COMPLETED);
      expect(route.completedAt).toEqual(completedAt);

      const events = route.pullDomainEvents();
      expect(events).toHaveLength(1);
      const completedEvent = events[0] as RouteCompletedEvent;
      expect(completedEvent.eventType).toBe(RouteEventType.COMPLETED);
      expect(completedEvent.fromState).toBe(RouteState.IN_PROGRESS);
      expect(completedEvent.toState).toBe(RouteState.COMPLETED);
      expect(completedEvent.closureId).toBe('closure-1');
      expect(completedEvent.totalAssigned).toBe(3);
      expect(completedEvent.deliveredCount).toBe(3);
      expect(completedEvent.occurredAt).toEqual(completedAt);
      expect(completedEvent.producer).toBe('routes');
    });

    it('successfully transitions from INTERRUPTED to COMPLETED', () => {
      const route = new Route(
        createRoutePropsFixture({
          id: 'route-1',
          tenantId: 'tenant-a',
          state: RouteState.INTERRUPTED,
          startedAt,
        }),
      );

      const summary = createSummaryFixture();
      route.complete(summary);

      expect(route.state).toBe(RouteState.COMPLETED);
      const events = route.pullDomainEvents();
      expect(events[0].fromState).toBe(RouteState.INTERRUPTED);
    });

    it('rejects completion from non-eligible states (PLANNED, READY, COMPLETED, CANCELLED)', () => {
      const invalidStates = [
        RouteState.PLANNED,
        RouteState.READY,
        RouteState.COMPLETED,
        RouteState.CANCELLED,
        RouteState.DRAFT,
      ];

      for (const invalidState of invalidStates) {
        const route = new Route(
          createRoutePropsFixture({
            id: 'route-1',
            tenantId: 'tenant-a',
            state: invalidState,
            startedAt,
          }),
        );
        const summary = createSummaryFixture();

        expect(() => route.complete(summary)).toThrow(RouteStateConflictError);
      }
    });

    it('rejects completion if route has no startedAt timestamp', () => {
      const route = new Route(
        createRoutePropsFixture({
          id: 'route-1',
          tenantId: 'tenant-a',
          state: RouteState.IN_PROGRESS,
          startedAt: null,
        }),
      );
      const summary = createSummaryFixture();

      expect(() => route.complete(summary)).toThrow(RouteValidationError);
      expect(() => route.complete(summary)).toThrow(/startedAt/);
    });

    it('rejects completion if summary routeId does not match route id', () => {
      const route = new Route(
        createRoutePropsFixture({
          id: 'route-1',
          tenantId: 'tenant-a',
          state: RouteState.IN_PROGRESS,
          startedAt,
        }),
      );
      const summary = createSummaryFixture({ routeId: 'route-different' });

      expect(() => route.complete(summary)).toThrow(RouteValidationError);
    });

    it('rejects completion if summary tenantId does not match route tenantId', () => {
      const route = new Route(
        createRoutePropsFixture({
          id: 'route-1',
          tenantId: 'tenant-a',
          state: RouteState.IN_PROGRESS,
          startedAt,
        }),
      );
      const summary = createSummaryFixture({ tenantId: 'tenant-other' });

      expect(() => route.complete(summary)).toThrow(RouteValidationError);
    });
  });

  describe('RouteClosurePolicy (CA-02, CA-03, CA-06)', () => {
    it('approves REGULAR closure when all stops are resolved and custody is resolved', () => {
      expect(() =>
        RouteClosurePolicy.validateClosureEligibility({
          routeId: 'route-1',
          currentState: RouteState.IN_PROGRESS,
          startedAt,
          mode: RouteClosureMode.REGULAR,
          stopStates: [
            { stopId: 's1', state: RouteStopState.COMPLETED },
            { stopId: 's2', state: RouteStopState.FAILED },
          ],
          pendingActiveCargoAssignmentsCount: 0,
        }),
      ).not.toThrow();
    });

    it('rejects REGULAR closure if any stop remains PENDING', () => {
      expect(() =>
        RouteClosurePolicy.validateClosureEligibility({
          routeId: 'route-1',
          currentState: RouteState.IN_PROGRESS,
          startedAt,
          mode: RouteClosureMode.REGULAR,
          stopStates: [
            { stopId: 's1', state: RouteStopState.COMPLETED },
            { stopId: 's2', state: RouteStopState.PENDING },
          ],
          pendingActiveCargoAssignmentsCount: 0,
        }),
      ).toThrow(RouteHasPendingStopsError);
    });

    it('rejects REGULAR closure if reasonCode is supplied', () => {
      expect(() =>
        RouteClosurePolicy.validateClosureEligibility({
          routeId: 'route-1',
          currentState: RouteState.IN_PROGRESS,
          startedAt,
          mode: RouteClosureMode.REGULAR,
          reasonCode: 'VEHICLE_BREAKDOWN',
          stopStates: [{ stopId: 's1', state: RouteStopState.COMPLETED }],
          pendingActiveCargoAssignmentsCount: 0,
        }),
      ).toThrow(RouteValidationError);
    });

    it('rejects any closure if active cargo assignments remain without confirmed depot receipt', () => {
      expect(() =>
        RouteClosurePolicy.validateClosureEligibility({
          routeId: 'route-1',
          currentState: RouteState.IN_PROGRESS,
          startedAt,
          mode: RouteClosureMode.REGULAR,
          stopStates: [{ stopId: 's1', state: RouteStopState.COMPLETED }],
          pendingActiveCargoAssignmentsCount: 2,
        }),
      ).toThrow(RouteCustodyUnresolvedError);
    });

    it('approves FORCED closure with pending stops when reasonCode, notes and depot custody are satisfied', () => {
      expect(() =>
        RouteClosurePolicy.validateClosureEligibility({
          routeId: 'route-1',
          currentState: RouteState.IN_PROGRESS,
          startedAt,
          mode: RouteClosureMode.FORCED,
          reasonCode: 'VEHICLE_BREAKDOWN',
          notes: 'Vehicle broke down; cargo received at central depot.',
          stopStates: [
            { stopId: 's1', state: RouteStopState.COMPLETED },
            { stopId: 's2', state: RouteStopState.PENDING },
          ],
          pendingActiveCargoAssignmentsCount: 0,
        }),
      ).not.toThrow();
    });

    it('rejects FORCED closure if reasonCode or notes are missing or empty', () => {
      expect(() =>
        RouteClosurePolicy.validateClosureEligibility({
          routeId: 'route-1',
          currentState: RouteState.IN_PROGRESS,
          startedAt,
          mode: RouteClosureMode.FORCED,
          reasonCode: '',
          notes: 'Valid notes',
          stopStates: [{ stopId: 's1', state: RouteStopState.PENDING }],
          pendingActiveCargoAssignmentsCount: 0,
        }),
      ).toThrow(RouteValidationError);

      expect(() =>
        RouteClosurePolicy.validateClosureEligibility({
          routeId: 'route-1',
          currentState: RouteState.IN_PROGRESS,
          startedAt,
          mode: RouteClosureMode.FORCED,
          reasonCode: 'WEATHER',
          notes: '   ',
          stopStates: [{ stopId: 's1', state: RouteStopState.PENDING }],
          pendingActiveCargoAssignmentsCount: 0,
        }),
      ).toThrow(RouteValidationError);
    });
  });

  describe('RouteManifestReconciliationPolicy (CA-03, CA-04)', () => {
    it('reconciles the canonical 7-package forced scenario into exact disjoint partition (7 = 2+1+1+1+2)', () => {
      const scenario = createSevenPackagesForcedScenarioFixture();

      const result = RouteManifestReconciliationPolicy.reconcile({
        routeId: scenario.routeId,
        dispatchManifest: scenario.manifest,
        membersWithOutcomes: scenario.facts.map((f) => ({
          assignmentId: f.assignmentId,
          packageId: f.packageId,
          routeStopId: f.routeStopId,
          outcome: f.outcome,
          receiptConfirmed: f.physicalReceiptConfirmed,
          depotId: f.physicalReceiptDepotId,
          failureReasonCode: f.failureReasonCode,
        })),
      });

      expect(result.totalAssigned).toBe(7);
      expect(result.deliveredCount).toBe(2);
      expect(result.failedCount).toBe(1);
      expect(result.rescheduledCount).toBe(1);
      expect(result.returnedCount).toBe(1);
      expect(result.pendingCount).toBe(2);
      expect(
        result.deliveredCount +
          result.failedCount +
          result.rescheduledCount +
          result.returnedCount +
          result.pendingCount,
      ).toBe(7);
    });

    it('reconciles the regular all-delivered scenario', () => {
      const scenario = createRegularAllDeliveredScenarioFixture();

      const result = RouteManifestReconciliationPolicy.reconcile({
        routeId: scenario.routeId,
        dispatchManifest: scenario.manifest,
        membersWithOutcomes: scenario.facts.map((f) => ({
          assignmentId: f.assignmentId,
          packageId: f.packageId,
          routeStopId: f.routeStopId,
          outcome: f.outcome,
          receiptConfirmed: f.physicalReceiptConfirmed,
        })),
      });

      expect(result.totalAssigned).toBe(3);
      expect(result.deliveredCount).toBe(3);
      expect(result.failedCount).toBe(0);
      expect(result.pendingCount).toBe(0);
    });

    it('rejects an empty dispatch manifest with RouteManifestEmptyError', () => {
      expect(() =>
        RouteManifestReconciliationPolicy.reconcile({
          routeId: 'route-1',
          dispatchManifest: [],
          membersWithOutcomes: [],
        }),
      ).toThrow(RouteManifestEmptyError);
    });

    it('rejects if a reconciled member is not part of the dispatch manifest', () => {
      expect(() =>
        RouteManifestReconciliationPolicy.reconcile({
          routeId: 'route-1',
          dispatchManifest: [
            { assignmentId: 'a1', packageId: 'p1', routeStopId: 's1' },
          ],
          membersWithOutcomes: [
            {
              assignmentId: 'a2',
              packageId: 'p2',
              routeStopId: 's1',
              outcome: RouteManifestOutcome.DELIVERED,
              receiptConfirmed: false,
            },
          ],
        }),
      ).toThrow(RouteManifestInconsistentError);
    });

    it('rejects duplicate member records in the reconciliation', () => {
      expect(() =>
        RouteManifestReconciliationPolicy.reconcile({
          routeId: 'route-1',
          dispatchManifest: [
            { assignmentId: 'a1', packageId: 'p1', routeStopId: 's1' },
          ],
          membersWithOutcomes: [
            {
              assignmentId: 'a1',
              packageId: 'p1',
              routeStopId: 's1',
              outcome: RouteManifestOutcome.DELIVERED,
              receiptConfirmed: false,
            },
            {
              assignmentId: 'a1',
              packageId: 'p1',
              routeStopId: 's1',
              outcome: RouteManifestOutcome.FAILED,
              receiptConfirmed: true,
            },
          ],
        }),
      ).toThrow(RouteManifestInconsistentError);
    });
  });

  describe('RouteClosureSummary Value Object (CA-04, CA-05)', () => {
    it('computes durations, effectiveness ratio, distance delta and ratio accurately', () => {
      const summary = createSummaryFixture({
        startedAt: new Date('2026-10-06T08:00:00.000Z'),
        completedAt: new Date('2026-10-06T10:30:00.000Z'),
        totalAssigned: 4,
        deliveredCount: 3,
        failedCount: 1,
        rescheduledCount: 0,
        returnedCount: 0,
        pendingCount: 0,
        plannedDistanceM: 20000,
        actualDistanceM: 25000,
      });

      expect(summary.actualDurationMs).toBe(2.5 * 3600 * 1000);
      expect(summary.actualDurationS).toBe(9000);
      expect(summary.deliveryEffectivenessRatio).toBe(0.75);
      expect(summary.distanceDeltaM).toBe(5000);
      expect(summary.distanceRatio).toBe(1.25);
    });

    it('handles null actual distance gracefully without throwing', () => {
      const summary = createSummaryFixture({
        actualDistanceM: null,
      });

      expect(summary.actualDistanceM).toBeNull();
      expect(summary.distanceDeltaM).toBeNull();
      expect(summary.distanceRatio).toBeNull();
    });

    it('rejects if completedAt is earlier than startedAt', () => {
      expect(
        () =>
          new RouteClosureSummary({
            ...createSummaryFixture(),
            startedAt: new Date('2026-10-06T12:00:00Z'),
            completedAt: new Date('2026-10-06T10:00:00Z'),
          }),
      ).toThrow(RouteValidationError);
    });

    it('rejects if sum of counts does not match totalAssigned', () => {
      expect(
        () =>
          new RouteClosureSummary({
            ...createSummaryFixture(),
            totalAssigned: 5,
            deliveredCount: 3,
            failedCount: 1, // sum = 4 != 5
          }),
      ).toThrow(RouteValidationError);
    });

    it('rejects negative counts', () => {
      expect(
        () =>
          new RouteClosureSummary({
            ...createSummaryFixture(),
            deliveredCount: -1,
          }),
      ).toThrow(RouteValidationError);
    });

    it('enforces deep immutability with Object.freeze', () => {
      const summary = createSummaryFixture();

      expect(Object.isFrozen(summary)).toBe(true);
      expect(Object.isFrozen(summary.members)).toBe(true);
      expect(Object.isFrozen(summary.stops)).toBe(true);
      expect(Object.isFrozen(summary.failureReasons)).toBe(true);
      expect(Object.isFrozen(summary.incidents)).toBe(true);
    });

    it('toSnapshot produces complete serializable state with ISO string dates', () => {
      const summary = createSummaryFixture();
      const snapshot = summary.toSnapshot();

      expect(snapshot.schemaVersion).toBe(1);
      expect(snapshot.closureId).toBe('closure-1');
      expect(snapshot.deliveryEffectivenessRatio).toBe(1);
      expect(snapshot.startedAt).toBe(startedAt.toISOString());
      expect(snapshot.completedAt).toBe(completedAt.toISOString());
    });
  });

  describe('PackageAggregate.recoverToPendingAssignment() (CA-03)', () => {
    it('recovers package from IN_TRANSIT to PENDING_ASSIGNMENT', () => {
      const pkg = PackageAggregate.reconstitute({
        id: 'pkg-1',
        tenantId: 'tenant-a',
        state: PackageStatus.IN_TRANSIT,
      });

      pkg.recoverToPendingAssignment('ROUTE_FORCED_CLOSURE', {
        actorUserId: 'coord-1',
        correlationId: 'corr-rec-1',
      });

      expect(pkg.state).toBe(PackageStatus.PENDING_ASSIGNMENT);
      const events = pkg.pullDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0].fromState).toBe(PackageStatus.IN_TRANSIT);
      expect(events[0].toState).toBe(PackageStatus.PENDING_ASSIGNMENT);
      expect(events[0].reasonCode).toBe('ROUTE_FORCED_CLOSURE');
    });

    it('recovers package from OUT_FOR_DELIVERY to PENDING_ASSIGNMENT', () => {
      const pkg = PackageAggregate.reconstitute({
        id: 'pkg-2',
        tenantId: 'tenant-a',
        state: PackageStatus.OUT_FOR_DELIVERY,
      });

      pkg.recoverToPendingAssignment('NOT_ATTENDED_AT_CLOSURE');

      expect(pkg.state).toBe(PackageStatus.PENDING_ASSIGNMENT);
    });

    it('rejects recovery from DELIVERED state', () => {
      const pkg = PackageAggregate.reconstitute({
        id: 'pkg-3',
        tenantId: 'tenant-a',
        state: PackageStatus.DELIVERED,
      });

      expect(() =>
        pkg.recoverToPendingAssignment('NOT_ATTENDED_AT_CLOSURE'),
      ).toThrow(InvalidPackageTransitionError);
    });
  });
});
