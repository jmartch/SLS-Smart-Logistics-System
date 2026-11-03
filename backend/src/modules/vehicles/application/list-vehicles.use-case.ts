import {
  VehicleQueryPort,
  type ListVehiclesQuery,
  type VehicleListResult,
} from './ports/vehicle-query.port';

export class ListVehiclesUseCase {
  constructor(private readonly vehicles: VehicleQueryPort) {}

  execute(
    tenantId: string,
    query: ListVehiclesQuery,
  ): Promise<VehicleListResult> {
    return this.vehicles.listByTenant(tenantId, query);
  }
}
