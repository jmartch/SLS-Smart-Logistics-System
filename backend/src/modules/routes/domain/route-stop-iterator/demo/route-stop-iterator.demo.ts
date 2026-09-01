import { Route } from '../core/route';
import { RouteStopStatus, type RouteStop } from '../core/route-stop';

const stops: RouteStop[] = [
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

const route = new Route('ROUTE-001', stops);
const iterator = route.createStopIterator();

console.log(`\n=== Ordered stops for ${route.id} ===`);

while (iterator.hasNext()) {
  const stop = iterator.next();

  if (stop) {
    console.log(
      `${stop.sequence}. ${stop.id} - ${stop.address} [${stop.status}]`,
    );
  }
}

console.log('\nEnd of route:', iterator.next());

iterator.reset();
console.log('First stop after reset:', iterator.next()?.id);
