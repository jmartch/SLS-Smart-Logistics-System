export interface PackageSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly trackingCode: string;
  readonly currentState: string;
  readonly weightKg: number;
  readonly volumeM3: number;
}

export interface PackageStateUpdate {
  readonly packageId: string;
  readonly previousState: string;
  readonly nextState: string;
}

export interface PackageStatusHistoryRecord {
  readonly packageId: string;
  readonly previousState: string;
  readonly nextState: string;
  readonly reasonCode?: string;
  readonly changedByUserId: string;
  readonly changedAt: Date;
}

export interface PackageStateWriterPort {
  findPackagesByRouteId(
    tenantId: string,
    routeId: string,
  ): Promise<readonly PackageSnapshot[]>;

  updatePackageStates(
    tenantId: string,
    updates: readonly PackageStateUpdate[],
  ): Promise<void>;

  recordStatusHistories(
    tenantId: string,
    histories: readonly PackageStatusHistoryRecord[],
  ): Promise<void>;
}
