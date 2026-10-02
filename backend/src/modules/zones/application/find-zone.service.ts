import type {
  ZoneCatalogEntry,
  ZoneCatalogPort,
} from './ports/zone-catalog.port';

export class FindZoneService {
  constructor(private readonly catalog: ZoneCatalogPort) {}

  async execute(
    tenantId: string,
    zoneId: string,
  ): Promise<ZoneCatalogEntry | null> {
    return this.catalog.findByTenant(tenantId, zoneId);
  }
}
