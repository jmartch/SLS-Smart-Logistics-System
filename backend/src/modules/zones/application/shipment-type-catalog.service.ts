import { normalizeCatalogCode } from '../domain/catalog-code';
import { normalizeCatalogName } from '../domain/catalog-name';
import type {
  CreateShipmentTypeResult,
  ListShipmentTypesFilter,
  ShipmentTypeCatalogEntry,
  ShipmentTypeCatalogPort,
} from './ports/shipment-type-catalog.port';

export interface CreateShipmentTypeCommand {
  readonly code: string;
  readonly name: string;
  readonly active?: boolean;
}

export class ShipmentTypeCatalogService {
  constructor(private readonly catalog: ShipmentTypeCatalogPort) { }

  async create(
    tenantId: string,
    command: CreateShipmentTypeCommand,
  ): Promise<CreateShipmentTypeResult> {
    const code = normalizeCatalogCode(command.code);
    const name = normalizeCatalogName(command.name);
    const active = command.active ?? true;

    return this.catalog.createByTenant(tenantId, { code, name, active });
  }

  async list(
    tenantId: string,
    filter?: ListShipmentTypesFilter,
  ): Promise<readonly ShipmentTypeCatalogEntry[]> {
    return this.catalog.listByTenant(tenantId, filter);
  }

  async findById(
    tenantId: string,
    id: string,
  ): Promise<ShipmentTypeCatalogEntry | null> {
    return this.catalog.findByTenant(tenantId, id);
  }
}
