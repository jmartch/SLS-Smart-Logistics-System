import { CatalogDomainError } from './catalog-errors';

export type InvalidCatalogReferenceReason =
  'ZONE_TENANT_MISMATCH' | 'SECTOR_TENANT_MISMATCH' | 'SECTOR_ZONE_MISMATCH';

const CATALOG_REFERENCE_ERROR_MESSAGES: Readonly<
  Record<InvalidCatalogReferenceReason, string>
> = {
  ZONE_TENANT_MISMATCH: 'Zone was not found',
  SECTOR_TENANT_MISMATCH: 'Sector was not found',
  SECTOR_ZONE_MISMATCH: 'Sector does not belong to the specified zone',
};

export class InvalidCatalogReferenceError extends CatalogDomainError {
  constructor(
    readonly code: InvalidCatalogReferenceReason,
    override readonly field: 'zoneId' | 'sectorId',
  ) {
    super(CATALOG_REFERENCE_ERROR_MESSAGES[code], field);
  }
}
