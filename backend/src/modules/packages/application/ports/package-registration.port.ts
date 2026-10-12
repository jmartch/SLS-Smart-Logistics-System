import type {
    PackagePriorityName,
    PackageRegistrationData,
} from '../../domain/package-registration';
import type { PackageReferenceSnapshot } from '../../domain/package-reference.policy';

export interface PackageReferenceQuery {
    readonly shipmentTypeId: string;
    readonly zoneId: string | null;
    readonly sectorId: string | null;
}

export interface RegisteredPackage {
    readonly id: string;
    readonly tenantId: string;
    readonly trackingCode: string;
    readonly publicTrackingToken: string;
    readonly state: string;
    readonly addressId: string;
    readonly shipmentTypeId: string;
    readonly zoneId: string | null;
    readonly sectorId: string | null;
    readonly weightKg: string;
    readonly lengthCm: string;
    readonly widthCm: string;
    readonly heightCm: string;
    readonly volumeM3: string;
    readonly priority: PackagePriorityName;
    readonly deadline: Date | null;
    readonly serviceDurationSeconds: number | null;
}

export type RegisterPackageOutcome =
    | { readonly ok: true; readonly package: RegisteredPackage }
    | { readonly ok: false; readonly code: 'PACKAGE_TRACKING_CODE_CONFLICT' };

export interface PackageRegistrationPort {
    loadReferences(
        tenantId: string,
        query: PackageReferenceQuery,
    ): Promise<PackageReferenceSnapshot>;

    /**
     * Persiste de forma atómica: dirección, paquete (estado REGISTERED) e
     * historial inicial. Todo o nada.
     */
    registerByTenant(
        tenantId: string,
        data: PackageRegistrationData,
        publicTrackingToken: string,
    ): Promise<RegisterPackageOutcome>;
}
