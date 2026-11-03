import type {
  VehicleChanges,
  VehicleSnapshot,
} from '../../domain/vehicle-management.policy';

export interface VehicleManagementContext {
  readonly tenantId: string;
  readonly actorUserId: string;
  readonly correlationId: string;
}
export interface VehicleManagementSession {
  loadForUpdate(vehicleId: string): Promise<VehicleSnapshot | null>;
  save(vehicleId: string, changes: VehicleChanges): Promise<void>;
  audit(
    vehicleId: string,
    action: 'VEHICLE_UPDATED' | 'VEHICLE_STATUS_UPDATED',
    before: VehicleSnapshot,
    after: VehicleSnapshot,
  ): Promise<void>;
}
export abstract class VehicleManagementPort {
  abstract findByTenantAndId(
    tenantId: string,
    vehicleId: string,
  ): Promise<VehicleSnapshot | null>;
  abstract run<T>(
    context: VehicleManagementContext,
    operation: (session: VehicleManagementSession) => Promise<T>,
  ): Promise<T>;
}
