import {
  normalizeMaxVolumeM3,
  normalizeMaxWeightKg,
} from '../domain/vehicle-capacity';
import { normalizeVehiclePlate } from '../domain/vehicle-plate';
import type {
  CreateVehicleResult,
  VehicleRepositoryPort,
} from './ports/vehicle-repository.port';

export interface RegisterVehicleCommand {
  readonly plate?: unknown;
  readonly maxWeightKg?: unknown;
  readonly maxVolumeM3?: unknown;
}

export class RegisterVehicleService {
  constructor(private readonly vehicles: VehicleRepositoryPort) {}

  async execute(
    tenantId: string,
    command: RegisterVehicleCommand,
  ): Promise<CreateVehicleResult> {
    const plate = normalizeVehiclePlate(command.plate);
    const maxWeightKg = normalizeMaxWeightKg(command.maxWeightKg);
    const maxVolumeM3 = normalizeMaxVolumeM3(command.maxVolumeM3);

    return this.vehicles.createByTenant(tenantId, {
      plate,
      maxWeightKg,
      maxVolumeM3,
    });
  }
}
