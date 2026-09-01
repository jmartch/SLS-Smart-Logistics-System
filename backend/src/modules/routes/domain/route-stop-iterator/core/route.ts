import { OrderedRouteStopIterator } from '../iterators/ordered-route-stop.iterator';
import type { RouteStopIterator } from './route-stop-iterator';
import type { RouteStop } from './route-stop';

export class Route {
  private readonly stops: readonly RouteStop[];

  constructor(
    readonly id: string,
    stops: readonly RouteStop[],
  ) {
    this.stops = [...stops];
  }

  createStopIterator(): RouteStopIterator {
    return new OrderedRouteStopIterator(this.stops);
  }
}
