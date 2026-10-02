import { normalizeCatalogCode } from '../domain/catalog-code';
import { normalizeCatalogName } from '../domain/catalog-name';
import type {
    CreateSectorResult,
    SectorCatalogPort,
} from './ports/sector-catalog.port';

export interface CreateSectorCommand {
    readonly zoneId: string;
    readonly code: string;
    readonly name: string;
}

export class CreateSectorService {
    constructor(private readonly catalog: SectorCatalogPort) { }

    async execute(
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
}