import type { RouteStop } from './route-stop';

export interface RouteStopIterator {
  hasNext(): boolean;
  next(): RouteStop | null;
  reset(): void;
}
