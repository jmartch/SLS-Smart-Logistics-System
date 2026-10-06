import { RouteStop } from '../route-stop';
import { RouteStopIterator } from './route-stop-iterator';

export class OrderedRouteStopIterator implements RouteStopIterator {
  private readonly items: readonly RouteStop[];
  private currentIndex = -1;

  constructor(stops: readonly RouteStop[]) {
    this.items = Object.freeze(
      [...stops].sort((a, b) => a.stopNumber - b.stopNumber),
    );
  }

  hasNext(): boolean {
    return this.currentIndex + 1 < this.items.length;
  }

  next(): RouteStop | null {
    if (!this.hasNext()) {
      return null;
    }
    this.currentIndex++;
    return this.items[this.currentIndex] ?? null;
  }

  current(): RouteStop | null {
    if (this.currentIndex < 0 || this.currentIndex >= this.items.length) {
      return null;
    }
    return this.items[this.currentIndex] ?? null;
  }

  reset(): void {
    this.currentIndex = -1;
  }
}
