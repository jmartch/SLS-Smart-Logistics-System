import { normalizeCatalogCode } from '../domain/catalog-code';
import { normalizeCatalogName } from '../domain/catalog-name';
import type {
  CreateShipmentTypeResult,
  ShipmentTypeCatalogPort,
} from './ports/shipment-type-catalog.port';

export interface CreateShipmentTypeCommand {
  readonly code: string;
  readonly name: string;
  readonly active?: boolean;
}

export class CreateShipmentTypeService {
  constructor(private readonly catalog: ShipmentTypeCatalogPort) {}

  async execute(
    tenantId: string,
    command: CreateShipmentTypeCommand,
  ): Promise<CreateShipmentTypeResult> {
    const code = normalizeCatalogCode(command.code);
    const name = normalizeCatalogName(command.name);
    const active = command.active ?? true;

    return this.catalog.createByTenant(tenantId, { code, name, active });
  }
}
