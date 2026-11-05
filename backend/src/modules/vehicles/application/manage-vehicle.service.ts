import { normalizeVehiclePlate } from '../domain/vehicle-plate';
import {
  normalizeMaxVolumeM3,
  normalizeMaxWeightKg,
} from '../domain/vehicle-capacity';
import {
  VehicleNotFoundError,
  VehicleValidationError,
} from '../domain/vehicle-errors';
import {
  assertVehicleChangeAllowed,
  vehicleDetail,
  type VehicleChanges,
} from '../domain/vehicle-management.policy';
import {
  VehicleManagementPort,
  type VehicleManagementContext,
} from './ports/vehicle-management.port';

function id(value: string): string {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new VehicleNotFoundError();
  return value.toLowerCase();
}
function input(
  value: unknown,
  allowed: readonly string[],
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new VehicleValidationError('Provide a valid object');
  const body = value as Record<string, unknown>;
  if (!Object.keys(body).length)
    throw new VehicleValidationError('Provide at least one field');
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key))
      throw new VehicleValidationError('Field is not supported', key);
  }
  return body;
}
export class ManageVehicleService {
  constructor(private readonly vehicles: VehicleManagementPort) {}

  async detail(tenantId: string, vehicleId: string) {
    const snapshot = await this.vehicles.findByTenantAndId(
      tenantId,
      id(vehicleId),
    );
    if (!snapshot) throw new VehicleNotFoundError();
    return vehicleDetail(snapshot);
  }

  update(context: VehicleManagementContext, vehicleId: string, raw: unknown) {
    const body = input(raw, ['plate', 'maxWeightKg', 'maxVolumeM3']);
    const changes: VehicleChanges = {
      ...('plate' in body ? { plate: normalizeVehiclePlate(body.plate) } : {}),
      ...('maxWeightKg' in body
        ? { maxWeightKg: normalizeMaxWeightKg(body.maxWeightKg) }
        : {}),
      ...('maxVolumeM3' in body
        ? { maxVolumeM3: normalizeMaxVolumeM3(body.maxVolumeM3) }
        : {}),
    };
    return this.change(context, id(vehicleId), changes, 'VEHICLE_UPDATED');
  }

  changeStatus(
    context: VehicleManagementContext,
    vehicleId: string,
    raw: unknown,
  ) {
    const body = input(raw, ['status']);
    if (
      body.status !== 'ACTIVE' &&
      body.status !== 'INACTIVE' &&
      body.status !== 'MAINTENANCE'
    ) {
      throw new VehicleValidationError(
        'Select a valid vehicle status',
        'status',
      );
    }
    return this.change(
      context,
      id(vehicleId),
      { status: body.status },
      'VEHICLE_STATUS_UPDATED',
    );
  }

  private change(
    context: VehicleManagementContext,
    vehicleId: string,
    changes: VehicleChanges,
    action: 'VEHICLE_UPDATED' | 'VEHICLE_STATUS_UPDATED',
  ) {
    return this.vehicles.run(context, async (session) => {
      const snapshot = await session.loadForUpdate(vehicleId);
      if (!snapshot) throw new VehicleNotFoundError();
      assertVehicleChangeAllowed(snapshot, changes);
      const updated = { ...snapshot, ...changes };
      await session.save(vehicleId, changes);
      await session.audit(vehicleId, action, snapshot, updated);
      return vehicleDetail(updated);
    });
  }
}
