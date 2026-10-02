import { normalizeCatalogCode } from '../domain/catalog-code';
import { normalizeCatalogName } from '../domain/catalog-name';
import type { CreateZoneResult, ZoneCatalogPort } from './ports/zone-catalog.port';

export interface CreateZoneCommand {
    readonly code: string;
    readonly name: string;
}

export class CreateZoneService {
    constructor(private readonly catalog: ZoneCatalogPort) { }

    async execute(
        tenantId: string,
        command: CreateZoneCommand,
    ): Promise<CreateZoneResult> {
        const code = normalizeCatalogCode(command.code);
        const name = normalizeCatalogName(command.name);

        return this.catalog.createByTenant(tenantId, { code, name });
    }
}