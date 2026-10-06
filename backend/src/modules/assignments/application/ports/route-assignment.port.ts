export interface RouteAssignmentRecord {
  readonly id: string;
  readonly packageId: string;
  readonly routeId: string;
  readonly routeStopId?: string | null;
  readonly status: 'ACTIVE' | 'ENDED' | 'CANCELLED';
}

export interface RouteAssignmentPort {
  findActiveAssignmentsByRouteId(
    tenantId: string,
    routeId: string,
  ): Promise<readonly RouteAssignmentRecord[]>;

  cancelAssignmentsByRouteId(
    tenantId: string,
    routeId: string,
    reasonCode: string,
    endedAt: Date,
  ): Promise<number>;
}
