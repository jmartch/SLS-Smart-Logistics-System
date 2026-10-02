import type {
  ZoneCatalogEntry,
  ZoneCatalogPort,
} from './ports/zone-catalog.port';

export class ListZonesService {
  constructor(private readonly catalog: ZoneCatalogPort) {}

  async execute(tenantId: string): Promise<readonly ZoneCatalogEntry[]> {
    return this.catalog.listByTenant(tenantId);
  }
}
