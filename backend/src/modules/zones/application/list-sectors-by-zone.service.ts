import type {
  SectorCatalogEntry,
  SectorCatalogPort,
} from './ports/sector-catalog.port';

export class ListSectorsByZoneService {
  constructor(private readonly catalog: SectorCatalogPort) {}

  async execute(
    tenantId: string,
    zoneId: string,
  ): Promise<readonly SectorCatalogEntry[]> {
    return this.catalog.listByZone(tenantId, zoneId);
  }
}
