import { RouteStop } from '../route-stop';

export interface RouteStopIterator {
  hasNext(): boolean;
  next(): RouteStop | null;
  current(): RouteStop | null;
  reset(): void;
}
