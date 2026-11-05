import { Route } from '../domain/route';
import { RouteStop } from '../domain/route-stop';
import { RouteStopState } from '../domain/route-stop-state';
import { OrderedRouteStopIterator } from '../domain/route-stop-iterator/ordered-route-stop.iterator';
import { PendingRouteStopIterator } from '../domain/route-stop-iterator/pending-route-stop.iterator';
import { FailedRouteStopIterator } from '../domain/route-stop-iterator/failed-route-stop.iterator';
import {
  createRoutePropsFixture,
  createRouteStopFixture,
} from './fixtures/route.fixtures';

function createMixedStopsFixture(): RouteStop[] {
  return [
    createRouteStopFixture({
      id: 'stop-3',
      stopNumber: 3,
      state: RouteStopState.PENDING,
    }),
    createRouteStopFixture({
      id: 'stop-1',
      stopNumber: 1,
      state: RouteStopState.COMPLETED,
    }),
    createRouteStopFixture({
      id: 'stop-2',
      stopNumber: 2,
      state: RouteStopState.FAILED,
    }),
    createRouteStopFixture({
      id: 'stop-4',
      stopNumber: 4,
      state: RouteStopState.PENDING,
    }),
  ];
}

describe('RouteStopIterator', () => {
  describe('OrderedRouteStopIterator', () => {
    it('iterates through all stops in ascending stopNumber order even when input is unsorted', () => {
      // Arrange
      const unsortedStops = [
        createRouteStopFixture({ id: 'stop-3', stopNumber: 3 }),
        createRouteStopFixture({ id: 'stop-1', stopNumber: 1 }),
        createRouteStopFixture({ id: 'stop-2', stopNumber: 2 }),
      ];
      const iterator = new OrderedRouteStopIterator(unsortedStops);

      // Act & Assert
      expect(iterator.current()).toBeNull();
      expect(iterator.hasNext()).toBe(true);

      const first = iterator.next();
      expect(first?.stopNumber).toBe(1);
      expect(iterator.current()?.stopNumber).toBe(1);

      const second = iterator.next();
      expect(second?.stopNumber).toBe(2);
      expect(iterator.current()?.stopNumber).toBe(2);

      const third = iterator.next();
      expect(third?.stopNumber).toBe(3);
      expect(iterator.current()?.stopNumber).toBe(3);

      expect(iterator.hasNext()).toBe(false);
      expect(iterator.next()).toBeNull();
      expect(iterator.current()?.stopNumber).toBe(3);
    });

    it('resets the cursor to the initial position on reset', () => {
      // Arrange
      const stops = [createRouteStopFixture({ id: 'stop-1', stopNumber: 1 })];
      const iterator = new OrderedRouteStopIterator(stops);

      // Act
      iterator.next();
      expect(iterator.current()?.stopNumber).toBe(1);
      iterator.reset();

      // Assert
      expect(iterator.current()).toBeNull();
      expect(iterator.hasNext()).toBe(true);
      expect(iterator.next()?.stopNumber).toBe(1);
    });

    it('behaves correctly with an empty stops collection', () => {
      // Arrange
      const iterator = new OrderedRouteStopIterator([]);

      // Act & Assert
      expect(iterator.hasNext()).toBe(false);
      expect(iterator.next()).toBeNull();
      expect(iterator.current()).toBeNull();

      iterator.reset();
      expect(iterator.hasNext()).toBe(false);
      expect(iterator.next()).toBeNull();
      expect(iterator.current()).toBeNull();
    });
  });

  describe('PendingRouteStopIterator', () => {
    it('iterates exclusively over PENDING stops preserving original stopNumbers', () => {
      // Arrange
      const stops = createMixedStopsFixture();
      const iterator = new PendingRouteStopIterator(stops);

      // Act & Assert
      expect(iterator.hasNext()).toBe(true);

      const firstPending = iterator.next();
      expect(firstPending?.id).toBe('stop-3');
      expect(firstPending?.stopNumber).toBe(3);
      expect(firstPending?.state).toBe(RouteStopState.PENDING);

      const secondPending = iterator.next();
      expect(secondPending?.id).toBe('stop-4');
      expect(secondPending?.stopNumber).toBe(4);
      expect(secondPending?.state).toBe(RouteStopState.PENDING);

      expect(iterator.hasNext()).toBe(false);
      expect(iterator.next()).toBeNull();
    });

    it('returns an empty iteration when no stops are in PENDING state', () => {
      // Arrange
      const nonPendingStops = [
        createRouteStopFixture({
          id: 's1',
          stopNumber: 1,
          state: RouteStopState.COMPLETED,
        }),
        createRouteStopFixture({
          id: 's2',
          stopNumber: 2,
          state: RouteStopState.FAILED,
        }),
      ];
      const iterator = new PendingRouteStopIterator(nonPendingStops);

      // Act & Assert
      expect(iterator.hasNext()).toBe(false);
      expect(iterator.next()).toBeNull();
      expect(iterator.current()).toBeNull();
    });
  });

  describe('FailedRouteStopIterator', () => {
    it('iterates exclusively over FAILED stops preserving original stopNumbers', () => {
      // Arrange
      const stops = createMixedStopsFixture();
      const iterator = new FailedRouteStopIterator(stops);

      // Act & Assert
      expect(iterator.hasNext()).toBe(true);

      const failedStop = iterator.next();
      expect(failedStop?.id).toBe('stop-2');
      expect(failedStop?.stopNumber).toBe(2);
      expect(failedStop?.state).toBe(RouteStopState.FAILED);

      expect(iterator.hasNext()).toBe(false);
      expect(iterator.next()).toBeNull();
      expect(iterator.current()?.stopNumber).toBe(2);
    });

    it('returns an empty iteration when no stops are in FAILED state', () => {
      // Arrange
      const nonFailedStops = [
        createRouteStopFixture({
          id: 's1',
          stopNumber: 1,
          state: RouteStopState.PENDING,
        }),
      ];
      const iterator = new FailedRouteStopIterator(nonFailedStops);

      // Act & Assert
      expect(iterator.hasNext()).toBe(false);
      expect(iterator.next()).toBeNull();
      expect(iterator.current()).toBeNull();
    });
  });

  describe('Route Aggregate Iterator Factories', () => {
    it('creates independent iterators that do not interfere with each other', () => {
      // Arrange
      const stops = [
        createRouteStopFixture({
          id: 'stop-1',
          stopNumber: 1,
          state: RouteStopState.PENDING,
        }),
        createRouteStopFixture({
          id: 'stop-2',
          stopNumber: 2,
          state: RouteStopState.FAILED,
        }),
      ];
      const route = new Route(createRoutePropsFixture({ stops }));

      // Act
      const iter1 = route.createIterator();
      const iter2 = route.createIterator();

      const iter1First = iter1.next();

      // Assert
      expect(iter1First?.stopNumber).toBe(1);
      expect(iter1.current()?.stopNumber).toBe(1);
      expect(iter2.current()).toBeNull(); // iter2 has not advanced

      const iter2First = iter2.next();
      expect(iter2First?.stopNumber).toBe(1);
      expect(iter2.current()?.stopNumber).toBe(1);
    });

    it('creates pending and failed iterators directly from route aggregate', () => {
      // Arrange
      const stops = [
        createRouteStopFixture({
          id: 'stop-1',
          stopNumber: 1,
          state: RouteStopState.COMPLETED,
        }),
        createRouteStopFixture({
          id: 'stop-2',
          stopNumber: 2,
          state: RouteStopState.PENDING,
        }),
        createRouteStopFixture({
          id: 'stop-3',
          stopNumber: 3,
          state: RouteStopState.FAILED,
        }),
      ];
      const route = new Route(createRoutePropsFixture({ stops }));

      // Act
      const pendingIterator = route.createPendingIterator();
      const failedIterator = route.createFailedIterator();

      // Assert
      expect(pendingIterator.next()?.id).toBe('stop-2');
      expect(pendingIterator.hasNext()).toBe(false);

      expect(failedIterator.next()?.id).toBe('stop-3');
      expect(failedIterator.hasNext()).toBe(false);
    });

    it('preserves defensive snapshot even if source array is mutated externally', () => {
      // Arrange
      const mutableStops = [
        createRouteStopFixture({ id: 'stop-1', stopNumber: 1 }),
        createRouteStopFixture({ id: 'stop-2', stopNumber: 2 }),
      ];
      const iterator = new OrderedRouteStopIterator(mutableStops);

      // Act
      mutableStops.push(
        createRouteStopFixture({ id: 'stop-3', stopNumber: 3 }),
      );

      // Assert: iterator still has only 2 stops
      expect(iterator.next()?.stopNumber).toBe(1);
      expect(iterator.next()?.stopNumber).toBe(2);
      expect(iterator.hasNext()).toBe(false);
      expect(iterator.next()).toBeNull();
    });
  });
});
