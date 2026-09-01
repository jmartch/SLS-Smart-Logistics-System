export enum RouteStopStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
}

export interface RouteStop {
  readonly id: string;
  readonly address: string;
  readonly sequence: number;
  readonly status: RouteStopStatus;
}
