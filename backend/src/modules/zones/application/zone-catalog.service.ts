import { normalizeCatalogCode } from '../domain/catalog-code';
import { normalizeCatalogName } from '../domain/catalog-name';
import type {
  CreateZoneResult,
  ZoneCatalogEntry,
  ZoneCatalogPort,
} from './ports/zone-catalog.port';

export interface CreateZoneCommand {
  readonly code: string;
  readonly name: string;
}

export class ZoneCatalogService {
  constructor(private readonly catalog: ZoneCatalogPort) { }

  async create(
    tenantId: string,
    command: CreateZoneCommand,
  ): Promise<CreateZoneResult> {
    const code = normalizeCatalogCode(command.code);
    const name = normalizeCatalogName(command.name);

    return this.catalog.createByTenant(tenantId, { code, name });
  }

  async list(tenantId: string): Promise<readonly ZoneCatalogEntry[]> {
    return this.catalog.listByTenant(tenantId);
  }

  async findById(
    tenantId: string,
    zoneId: string,
  ): Promise<ZoneCatalogEntry | null> {
    return this.catalog.findByTenant(tenantId, zoneId);
  }
}
