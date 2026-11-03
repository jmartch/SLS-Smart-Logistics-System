export type PackageClassificationReferenceFailure =
    | 'PACKAGE_ZONE_NOT_FOUND'
    | 'PACKAGE_SECTOR_NOT_FOUND'
    | 'PACKAGE_SECTOR_ZONE_MISMATCH';

export type PackageReferenceFailure =
    | 'PACKAGE_SHIPMENT_TYPE_NOT_FOUND'
    | 'PACKAGE_SHIPMENT_TYPE_INACTIVE'
    | PackageClassificationReferenceFailure;

export interface PackageClassificationReferenceSnapshot {
    readonly zone: { readonly id: string } | null;
    readonly sector: { readonly zoneId: string } | null;
}
export interface PackageReferenceSnapshot
    extends PackageClassificationReferenceSnapshot {
    readonly shipmentType: { readonly active: boolean } | null;
}

/**
 * Política de referencias para clasificación: la zona debe existir y el sector,
 * si se indica, debe existir y pertenecer a la zona.
 */
export function evaluateClassificationReferences(
    requested: {
        readonly zoneId: string;
        readonly sectorId: string | null;
    },
    snapshot: PackageClassificationReferenceSnapshot,
): PackageClassificationReferenceFailure | null {
    if (!snapshot.zone) {
        return 'PACKAGE_ZONE_NOT_FOUND';
    }

    if (requested.sectorId !== null) {
        if (!snapshot.sector) {
            return 'PACKAGE_SECTOR_NOT_FOUND';
        }
        if (snapshot.sector.zoneId !== requested.zoneId) {
            return 'PACKAGE_SECTOR_ZONE_MISMATCH';
        }
    }

    return null;
}

/**
 * Política de referencias: el tipo de envío debe existir y estar activo; la
 * zona y el sector, si se indican, deben existir y el sector debe pertenecer
 * a la zona. Devuelve el primer fallo o null si todo es coherente.
 */
export function evaluatePackageReferences(
    requested: {
        readonly zoneId: string | null;
        readonly sectorId: string | null;
    },
    snapshot: PackageReferenceSnapshot,
): PackageReferenceFailure | null {
    if (!snapshot.shipmentType) {
        return 'PACKAGE_SHIPMENT_TYPE_NOT_FOUND';
    }

    if (!snapshot.shipmentType.active) {
        return 'PACKAGE_SHIPMENT_TYPE_INACTIVE';
    }

    if (requested.zoneId !== null && !snapshot.zone) {
        return 'PACKAGE_ZONE_NOT_FOUND';
    }

    if (requested.sectorId !== null) {
        if (!snapshot.sector) {
            return 'PACKAGE_SECTOR_NOT_FOUND';
        }
        if (snapshot.sector.zoneId !== requested.zoneId) {
            return 'PACKAGE_SECTOR_ZONE_MISMATCH';
        }
    }

    return null;
}
