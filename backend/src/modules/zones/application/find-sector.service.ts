import type {
  SectorCatalogEntry,
  SectorCatalogPort,
} from './ports/sector-catalog.port';

export class FindSectorService {
  constructor(private readonly catalog: SectorCatalogPort) {}

  async execute(
    tenantId: string,
    sectorId: string,
  ): Promise<SectorCatalogEntry | null> {
    return this.catalog.findByTenant(tenantId, sectorId);
  }
}
