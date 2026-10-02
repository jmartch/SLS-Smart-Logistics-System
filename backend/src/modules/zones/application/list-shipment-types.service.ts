import type {
  ListShipmentTypesFilter,
  ShipmentTypeCatalogEntry,
  ShipmentTypeCatalogPort,
} from './ports/shipment-type-catalog.port';

export class ListShipmentTypesService {
  constructor(private readonly catalog: ShipmentTypeCatalogPort) {}

  async execute(
    tenantId: string,
    filter?: ListShipmentTypesFilter,
  ): Promise<readonly ShipmentTypeCatalogEntry[]> {
    return this.catalog.listByTenant(tenantId, filter);
  }
}
