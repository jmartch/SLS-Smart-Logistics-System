export type InvalidCatalogReferenceReason =
    | 'ZONE_TENANT_MISMATCH'
    | 'SECTOR_TENANT_MISMATCH'
    | 'SECTOR_ZONE_MISMATCH';

export class InvalidCatalogReferenceError extends Error {
    constructor(
        readonly code: InvalidCatalogReferenceReason,
        readonly field: 'zoneId' | 'sectorId',
    ) {
        super(code);
        this.name = 'InvalidCatalogReferenceError';
    }
}