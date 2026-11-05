import {
  VehicleCapacityConflictError,
  VehicleCommittedError,
} from './vehicle-errors';

export type ManagedVehicleStatus = 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE';
export interface VehicleSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly plate: string;
  readonly status: ManagedVehicleStatus;
  readonly maxWeightKg: string;
  readonly maxVolumeM3: string;
  readonly assignedWeightKg: string;
  readonly assignedVolumeM3: string;
  readonly routeStates: readonly string[];
  readonly activeAssignmentCount: number;
}
export interface VehicleChanges {
  readonly plate?: string;
  readonly maxWeightKg?: string;
  readonly maxVolumeM3?: string;
  readonly status?: ManagedVehicleStatus;
}

// Canonical persisted decimals: grams and cubic centimetres are exact integers.
function units(value: string, scale: number): bigint {
  const [integer, fraction = ''] = value.split('.');
  return (
    BigInt(integer) * 10n ** BigInt(scale) + BigInt(fraction.padEnd(scale, '0'))
  );
}
function remaining(maximum: string, load: string, scale: number): string {
  const result = units(maximum, scale) - units(load, scale);
  const absolute = (result < 0n ? -result : result)
    .toString()
    .padStart(scale + 1, '0');
  return `${result < 0n ? '-' : ''}${absolute.slice(0, -scale)}.${absolute.slice(-scale)}`;
}
export function vehicleDetail(snapshot: VehicleSnapshot) {
  return {
    id: snapshot.id,
    tenantId: snapshot.tenantId,
    plate: snapshot.plate,
    status: snapshot.status,
    maxWeightKg: snapshot.maxWeightKg,
    maxVolumeM3: snapshot.maxVolumeM3,
    assignedWeightKg: snapshot.assignedWeightKg,
    assignedVolumeM3: snapshot.assignedVolumeM3,
    isCommitted: isVehicleCommitted(snapshot),
    remainingWeightKg: remaining(
      snapshot.maxWeightKg,
      snapshot.assignedWeightKg,
      3,
    ),
    remainingVolumeM3: remaining(
      snapshot.maxVolumeM3,
      snapshot.assignedVolumeM3,
      6,
    ),
  };
}
function isVehicleCommitted(snapshot: VehicleSnapshot): boolean {
  return (
    snapshot.activeAssignmentCount > 0 ||
    snapshot.routeStates.some(
      (state) => !['COMPLETED', 'CANCELLED', 'PLANNING_FAILED'].includes(state),
    )
  );
}
export function assertVehicleChangeAllowed(
  snapshot: VehicleSnapshot,
  changes: VehicleChanges,
): void {
  if (
    changes.maxWeightKg !== undefined &&
    units(changes.maxWeightKg, 3) < units(snapshot.assignedWeightKg, 3)
  ) {
    throw new VehicleCapacityConflictError('maxWeightKg');
  }
  if (
    changes.maxVolumeM3 !== undefined &&
    units(changes.maxVolumeM3, 6) < units(snapshot.assignedVolumeM3, 6)
  ) {
    throw new VehicleCapacityConflictError('maxVolumeM3');
  }
  if (
    changes.status !== undefined &&
    changes.status !== 'ACTIVE' &&
    isVehicleCommitted(snapshot)
  ) {
    throw new VehicleCommittedError();
  }
}
