import type { ZoneReference } from '../../domain/catalog-reference.policy';

export interface ZoneCatalogEntry extends ZoneReference {
    readonly code: string;
    readonly name: string;
}

export interface CreateZoneData {
    readonly code: string;
    readonly name: string;
}

export type CreateZoneResult =
    | {
        readonly ok: true;
        readonly zone: ZoneCatalogEntry;
    }
    | {
        readonly ok: false;
        readonly code: 'CATALOG_CODE_CONFLICT';
    };

export interface ZoneCatalogPort {
    listByTenant(
        tenantId: string,
    ): Promise<readonly ZoneCatalogEntry[]>;

    findByTenant(
        tenantId: string,
        zoneId: string,
    ): Promise<ZoneCatalogEntry | null>;

    createByTenant(
        tenantId: string,
        data: CreateZoneData,
    ): Promise<CreateZoneResult>;
}