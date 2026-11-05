import { InvalidCatalogReferenceError } from './invalid-catalog-reference.error';

export interface ZoneReference {
    readonly id: string;
    readonly tenantId: string;
}

export interface SectorReference {
    readonly id: string;
    readonly tenantId: string;
    readonly zoneId: string;
}

export function assertCatalogReferences(
    tenantId: string,
    zone: ZoneReference,
    sector?: SectorReference | null,
): void {
    if (zone.tenantId !== tenantId) {
        throw new InvalidCatalogReferenceError(
            'ZONE_TENANT_MISMATCH',
            'zoneId',
        );
    }

    if (sector === undefined || sector === null) {
        return;
    }

    if (sector.tenantId !== tenantId) {
        throw new InvalidCatalogReferenceError(
            'SECTOR_TENANT_MISMATCH',
            'sectorId',
        );
    }

    if (sector.zoneId !== zone.id) {
        throw new InvalidCatalogReferenceError(
            'SECTOR_ZONE_MISMATCH',
            'sectorId',
        );
    }
}