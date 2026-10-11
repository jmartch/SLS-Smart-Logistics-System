import { Route, RouteProps } from '../domain/route';
import { RouteState } from '../domain/route-state';
import {
  RouteEventType,
  RouteCancelledEvent,
  RouteInterruptedEvent,
} from '../domain/events/route-lifecycle.event';
import {
  RouteStateConflictError,
  RouteManifestInvalidError,
  RouteValidationError,
} from '../domain/route-errors';
import {
  createRoutePropsFixture,
  createRouteStopFixture,
  createValidStopsFixture,
} from './fixtures/route.fixtures';

function createTestRoute(overrides?: Partial<RouteProps>): Route {
  return new Route(createRoutePropsFixture(overrides));
}

describe('Route', () => {
  describe('constructor and manifest validation', () => {
    it('creates a valid route when stops form a continuous 1..N sequence', () => {
      // Arrange
      const stops = createValidStopsFixture(3, 'tenant-a', 'route-1');

      // Act
      const route = createTestRoute({
        id: 'route-1',
        tenantId: 'tenant-a',
        stops,
      });

      // Assert
      expect(route.id).toBe('route-1');
      expect(route.tenantId).toBe('tenant-a');
      expect(route.state).toBe(RouteState.PLANNED);
      expect(route.stops).toHaveLength(3);
      expect(route.stops[0]?.stopNumber).toBe(1);
      expect(route.stops[1]?.stopNumber).toBe(2);
      expect(route.stops[2]?.stopNumber).toBe(3);
    });

    it('rejects stops belonging to a different tenant', () => {
      // Arrange
      const foreignStop = createRouteStopFixture({
        id: 'stop-alien',
        tenantId: 'tenant-b',
        routeId: 'route-1',
        stopNumber: 1,
      });

      // Act
      const create = () =>
        createTestRoute({
          id: 'route-1',
          tenantId: 'tenant-a',
          stops: [foreignStop],
        });

      // Assert
      expect(create).toThrow(RouteManifestInvalidError);
      expect(create).toThrow(/does not match route tenant/);
    });

    it('rejects stops referencing a different routeId', () => {
      // Arrange
      const mismatchedStop = createRouteStopFixture({
        id: 'stop-other-route',
        tenantId: 'tenant-a',
        routeId: 'route-other',
        stopNumber: 1,
      });

      // Act
      const create = () =>
        createTestRoute({
          id: 'route-1',
          tenantId: 'tenant-a',
          stops: [mismatchedStop],
        });

      // Assert
      expect(create).toThrow(RouteManifestInvalidError);
      expect(create).toThrow(/belongs to route 'route-other'/);
    });

    it('rejects stops with duplicate stop numbers', () => {
      // Arrange
      const duplicateStops = [
        createRouteStopFixture({ id: 'stop-1', stopNumber: 1 }),
        createRouteStopFixture({ id: 'stop-2', stopNumber: 1 }),
      ];

      // Act
      const create = () => createTestRoute({ stops: duplicateStops });

      // Assert
      expect(create).toThrow(RouteManifestInvalidError);
      expect(create).toThrow(/continuous sequence from 1 to N/);
    });

    it('rejects stops with gaps in the sequence', () => {
      // Arrange
      const gappedStops = [
        createRouteStopFixture({ id: 'stop-1', stopNumber: 1 }),
        createRouteStopFixture({ id: 'stop-3', stopNumber: 3 }),
      ];

      // Act
      const create = () => createTestRoute({ stops: gappedStops });

      // Assert
      expect(create).toThrow(RouteManifestInvalidError);
      expect(create).toThrow(/continuous sequence from 1 to N/);
    });

    it('allows creating a planned route with zero stops before preparation', () => {
      // Arrange & Act
      const emptyRoute = createTestRoute({ stops: [] });

      // Assert
      expect(emptyRoute.stops).toEqual([]);
      expect(emptyRoute.state).toBe(RouteState.PLANNED);
    });
  });

  describe('prepare', () => {
    it('transitions from PLANNED to READY and emits RoutePreparedEvent when route has stops', () => {
      // Arrange
      const route = createTestRoute({
        state: RouteState.PLANNED,
        stops: createValidStopsFixture(2),
      });

      // Act
      route.prepare({
        actorUserId: 'user-coordinator',
        correlationId: 'corr-prep-1',
      });

      // Assert
      expect(route.state).toBe(RouteState.READY);

      const events = route.pullDomainEvents();
      expect(events).toHaveLength(1);
      const [preparedEvent] = events;
      expect(preparedEvent?.eventType).toBe(RouteEventType.PREPARED);
      expect(preparedEvent?.fromState).toBe(RouteState.PLANNED);
      expect(preparedEvent?.toState).toBe(RouteState.READY);
      expect(preparedEvent?.producer).toBe('routes');
      expect(preparedEvent?.packageCount).toBe(2);
      expect(preparedEvent?.metadata?.actorUserId).toBe('user-coordinator');
      expect(preparedEvent?.metadata?.correlationId).toBe('corr-prep-1');
    });

    it('rejects preparation when route is not in PLANNED state', () => {
      // Arrange
      const route = createTestRoute({
        state: RouteState.READY,
        stops: createValidStopsFixture(1),
      });

      // Act
      const act = () => route.prepare();

      // Assert
      expect(act).toThrow(RouteStateConflictError);
      expect(route.pullDomainEvents()).toHaveLength(0);
    });

    it('rejects preparation when route has zero stops', () => {
      // Arrange
      const emptyRoute = createTestRoute({
        state: RouteState.PLANNED,
        stops: [],
      });

      // Act
      const act = () => emptyRoute.prepare();

      // Assert
      expect(act).toThrow(RouteManifestInvalidError);
      expect(act).toThrow(/zero stops/);
      expect(emptyRoute.state).toBe(RouteState.PLANNED);
      expect(emptyRoute.pullDomainEvents()).toHaveLength(0);
    });
  });

  describe('start', () => {
    it('transitions from READY to IN_PROGRESS, records startedAt and emits RouteStartedEvent', () => {
      // Arrange
      const route = createTestRoute({
        state: RouteState.READY,
        stops: createValidStopsFixture(2),
      });
      const fixedTimestamp = new Date('2026-10-06T09:30:00Z');

      // Act
      route.start({
        now: fixedTimestamp,
        actorUserId: 'user-courier',
        correlationId: 'corr-start-1',
      });

      // Assert
      expect(route.state).toBe(RouteState.IN_PROGRESS);
      expect(route.startedAt).toEqual(fixedTimestamp);

      const events = route.pullDomainEvents();
      expect(events).toHaveLength(1);
      const [startedEvent] = events;
      expect(startedEvent?.eventType).toBe(RouteEventType.STARTED);
      expect(startedEvent?.fromState).toBe(RouteState.READY);
      expect(startedEvent?.toState).toBe(RouteState.IN_PROGRESS);
      expect(startedEvent?.metadata?.actorUserId).toBe('user-courier');
    });

    it('rejects start when route is in PLANNED state', () => {
      // Arrange
      const route = createTestRoute({
        state: RouteState.PLANNED,
        stops: createValidStopsFixture(1),
      });

      // Act
      const act = () => route.start();

      // Assert
      expect(act).toThrow(RouteStateConflictError);
      expect(route.state).toBe(RouteState.PLANNED);
      expect(route.pullDomainEvents()).toHaveLength(0);
    });

    it('rejects start when route is already IN_PROGRESS or CANCELLED', () => {
      // Arrange
      const inProgressRoute = createTestRoute({
        state: RouteState.IN_PROGRESS,
        stops: createValidStopsFixture(1),
      });

      // Act
      const act = () => inProgressRoute.start();

      // Assert
      expect(act).toThrow(RouteStateConflictError);
    });
  });

  describe('cancel', () => {
    it('transitions from PLANNED to CANCELLED and emits RouteCancelledEvent', () => {
      // Arrange
      const route = createTestRoute({
        state: RouteState.PLANNED,
        stops: createValidStopsFixture(2),
      });

      // Act
      route.cancel('OPERATIONAL_WINDOW_MISSED', 'Customer cancelled orders', {
        actorUserId: 'coordinator-1',
      });

      // Assert
      expect(route.state).toBe(RouteState.CANCELLED);

      const events = route.pullDomainEvents();
      expect(events).toHaveLength(1);
      const [cancelledEvent] = events as readonly [RouteCancelledEvent];
      expect(cancelledEvent?.eventType).toBe(RouteEventType.CANCELLED);
      expect(cancelledEvent?.fromState).toBe(RouteState.PLANNED);
      expect(cancelledEvent?.toState).toBe(RouteState.CANCELLED);
      expect(cancelledEvent?.reasonCode).toBe('OPERATIONAL_WINDOW_MISSED');
      expect(cancelledEvent?.reason).toBe('Customer cancelled orders');
    });

    it('transitions from READY to CANCELLED and emits RouteCancelledEvent', () => {
      // Arrange
      const route = createTestRoute({
        state: RouteState.READY,
        stops: createValidStopsFixture(2),
      });

      // Act
      route.cancel('WEATHER_ALERT', 'Severe storm', {
        actorUserId: 'coordinator-1',
      });

      // Assert
      expect(route.state).toBe(RouteState.CANCELLED);

      const events = route.pullDomainEvents();
      expect(events).toHaveLength(1);
      const [cancelledEvent] = events;
      expect(cancelledEvent?.fromState).toBe(RouteState.READY);
      expect(cancelledEvent?.toState).toBe(RouteState.CANCELLED);
    });

    it('rejects cancellation when route has already started IN_PROGRESS', () => {
      // Arrange
      const activeRoute = createTestRoute({
        state: RouteState.IN_PROGRESS,
        stops: createValidStopsFixture(1),
      });

      // Act
      const act = () => activeRoute.cancel('VEHICLE_BREAKDOWN');

      // Assert
      expect(act).toThrow(RouteStateConflictError);
      expect(activeRoute.state).toBe(RouteState.IN_PROGRESS);
      expect(activeRoute.pullDomainEvents()).toHaveLength(0);
    });

    it('rejects cancellation when reasonCode is empty or whitespace only', () => {
      // Arrange
      const route = createTestRoute({ state: RouteState.PLANNED });

      // Act
      const actWithEmpty = () => route.cancel('');
      const actWithWhitespace = () => route.cancel('   ');

      // Assert
      expect(actWithEmpty).toThrow(RouteValidationError);
      expect(actWithWhitespace).toThrow(RouteValidationError);
      expect(route.state).toBe(RouteState.PLANNED);
    });
  });

  describe('interrupt', () => {
    it('transitions from IN_PROGRESS to INTERRUPTED and emits RouteInterruptedEvent', () => {
      // Arrange
      const route = createTestRoute({
        state: RouteState.IN_PROGRESS,
        stops: createValidStopsFixture(3),
      });

      // Act
      route.interrupt('VEHICLE_ACCIDENT', 'Minor traffic incident on route', {
        actorUserId: 'courier-1',
        correlationId: 'corr-int-1',
      });

      // Assert
      expect(route.state).toBe(RouteState.INTERRUPTED);

      const events = route.pullDomainEvents();
      expect(events).toHaveLength(1);
      const [interruptedEvent] = events as readonly [RouteInterruptedEvent];
      expect(interruptedEvent?.eventType).toBe(RouteEventType.INTERRUPTED);
      expect(interruptedEvent?.fromState).toBe(RouteState.IN_PROGRESS);
      expect(interruptedEvent?.toState).toBe(RouteState.INTERRUPTED);
      expect(interruptedEvent?.reasonCode).toBe('VEHICLE_ACCIDENT');
      expect(interruptedEvent?.reason).toBe('Minor traffic incident on route');
      expect(interruptedEvent?.metadata?.actorUserId).toBe('courier-1');
    });

    it('rejects interruption when route is not in IN_PROGRESS state', () => {
      // Arrange
      const plannedRoute = createTestRoute({ state: RouteState.PLANNED });
      const readyRoute = createTestRoute({ state: RouteState.READY });

      // Act & Assert
      expect(() => plannedRoute.interrupt('BREAKDOWN')).toThrow(
        RouteStateConflictError,
      );
      expect(() => readyRoute.interrupt('BREAKDOWN')).toThrow(
        RouteStateConflictError,
      );
    });

    it('rejects interruption when reasonCode is missing or whitespace only', () => {
      // Arrange
      const activeRoute = createTestRoute({ state: RouteState.IN_PROGRESS });

      // Act
      const act = () => activeRoute.interrupt('   ');

      // Assert
      expect(act).toThrow(RouteValidationError);
      expect(activeRoute.state).toBe(RouteState.IN_PROGRESS);
    });
  });

  describe('pullDomainEvents', () => {
    it('drains accumulated domain events leaving the queue empty', () => {
      // Arrange
      const route = createTestRoute({
        state: RouteState.PLANNED,
        stops: createValidStopsFixture(1),
      });
      route.prepare();

      // Act
      const firstDrain = route.pullDomainEvents();
      const secondDrain = route.pullDomainEvents();

      // Assert
      expect(firstDrain).toHaveLength(1);
      expect(secondDrain).toHaveLength(0);
      expect(Object.isFrozen(firstDrain)).toBe(true);
    });
  });
});
