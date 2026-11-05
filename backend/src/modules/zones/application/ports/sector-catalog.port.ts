import type { SectorReference } from '../../domain/catalog-reference.policy';

export interface SectorCatalogEntry extends SectorReference {
    readonly code: string;
    readonly name: string;
}

export interface CreateSectorData {
    readonly zoneId: string;
    readonly code: string;
    readonly name: string;
}

export type CreateSectorResult =
    | {
        readonly ok: true;
        readonly sector: SectorCatalogEntry;
    }
    | {
        readonly ok: false;
        readonly code: 'CATALOG_CODE_CONFLICT';
    }
    | {
        readonly ok: false;
        readonly code: 'ZONE_NOT_FOUND';
    };

export interface SectorCatalogPort {
    listByZone(
        tenantId: string,
        zoneId: string,
    ): Promise<readonly SectorCatalogEntry[]>;

    findByTenant(
        tenantId: string,
        sectorId: string,
    ): Promise<SectorCatalogEntry | null>;

    createByTenant(
        tenantId: string,
        data: CreateSectorData,
    ): Promise<CreateSectorResult>;
}