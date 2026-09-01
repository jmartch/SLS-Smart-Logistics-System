import { Route } from '../core/route';
import type { RouteStop } from '../core/route-stop';
import { RouteStopStatus } from '../core/route-stop';

function createStops(): RouteStop[] {
  return [
    {
      id: 'STOP-001',
      address: 'Carrera 53 # 80-25',
      sequence: 2,
      status: RouteStopStatus.PENDING,
    },
    {
      id: 'STOP-003',
      address: 'Calle 84 # 50-20',
      sequence: 3,
      status: RouteStopStatus.PENDING,
    },
    {
      id: 'STOP-002',
      address: 'Calle 72 # 45-10',
      sequence: 1,
      status: RouteStopStatus.COMPLETED,
    },
  ];
}

function collectStopIds(route: Route): string[] {
  const iterator = route.createStopIterator();
  const stopIds: string[] = [];

  while (iterator.hasNext()) {
    stopIds.push(iterator.next()!.id);
  }

  return stopIds;
}

describe('RouteStopIterator', () => {
  it('traverses route stops in sequence order', () => {
    const route = new Route('ROUTE-001', createStops());

    expect(collectStopIds(route)).toEqual(['STOP-002', 'STOP-001', 'STOP-003']);
  });

  it('returns null after reaching the end', () => {
    const iterator = new Route('ROUTE-001', []).createStopIterator();

    expect(iterator.hasNext()).toBe(false);
    expect(iterator.next()).toBeNull();
  });

  it('can restart the traversal', () => {
    const iterator = new Route('ROUTE-001', createStops()).createStopIterator();

    expect(iterator.next()?.id).toBe('STOP-002');
    expect(iterator.next()?.id).toBe('STOP-001');

    iterator.reset();

    expect(iterator.next()?.id).toBe('STOP-002');
  });

  it('does not expose changes to the original stop collection', () => {
    const stops = createStops();
    const route = new Route('ROUTE-001', stops);

    stops.push({
      id: 'STOP-004',
      address: 'Calle 90 # 51-30',
      sequence: 4,
      status: RouteStopStatus.PENDING,
    });

    expect(collectStopIds(route)).toHaveLength(3);
  });
});
