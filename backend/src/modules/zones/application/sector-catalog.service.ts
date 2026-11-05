import { normalizeCatalogCode } from '../domain/catalog-code';
import { normalizeCatalogName } from '../domain/catalog-name';
import type {
  CreateSectorResult,
  SectorCatalogEntry,
  SectorCatalogPort,
} from './ports/sector-catalog.port';

export interface CreateSectorCommand {
  readonly zoneId: string;
  readonly code: string;
  readonly name: string;
}

export class SectorCatalogService {
  constructor(private readonly catalog: SectorCatalogPort) { }

  async create(
    tenantId: string,
    command: CreateSectorCommand,
  ): Promise<CreateSectorResult> {
    const code = normalizeCatalogCode(command.code);
    const name = normalizeCatalogName(command.name);

    return this.catalog.createByTenant(tenantId, {
      zoneId: command.zoneId,
      code,
      name,
    });
  }

  async listByZone(
    tenantId: string,
    zoneId: string,
  ): Promise<readonly SectorCatalogEntry[]> {
    return this.catalog.listByZone(tenantId, zoneId);
  }

  async findById(
    tenantId: string,
    sectorId: string,
  ): Promise<SectorCatalogEntry | null> {
    return this.catalog.findByTenant(tenantId, sectorId);
  }
}
