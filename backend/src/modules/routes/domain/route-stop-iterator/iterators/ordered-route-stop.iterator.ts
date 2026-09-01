import type { RouteStopIterator } from '../core/route-stop-iterator';
import type { RouteStop } from '../core/route-stop';

export class OrderedRouteStopIterator implements RouteStopIterator {
  private readonly orderedStops: readonly RouteStop[];
  private currentIndex = 0;

  constructor(stops: readonly RouteStop[]) {
    this.orderedStops = [...stops].sort(
      (left, right) =>
        left.sequence - right.sequence || left.id.localeCompare(right.id),
    );
  }

  hasNext(): boolean {
    return this.currentIndex < this.orderedStops.length;
  }

  next(): RouteStop | null {
    if (!this.hasNext()) {
      return null;
    }

    const stop = this.orderedStops[this.currentIndex];
    this.currentIndex += 1;
    return stop;
  }

  reset(): void {
    this.currentIndex = 0;
  }
}
