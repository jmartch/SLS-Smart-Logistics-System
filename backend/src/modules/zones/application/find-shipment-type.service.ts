import type {
  ShipmentTypeCatalogEntry,
  ShipmentTypeCatalogPort,
} from './ports/shipment-type-catalog.port';

export class FindShipmentTypeService {
  constructor(private readonly catalog: ShipmentTypeCatalogPort) {}

  async execute(
    tenantId: string,
    id: string,
  ): Promise<ShipmentTypeCatalogEntry | null> {
    return this.catalog.findByTenant(tenantId, id);
  }
}
