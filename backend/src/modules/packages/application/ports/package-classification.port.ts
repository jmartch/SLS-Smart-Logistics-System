import type { PackageClassificationData } from '../../domain/package-classification';
import type { PackageLifecycleOperation } from '../../domain/package-lifecycle.repository';
import type { PackageClassificationReferenceSnapshot } from '../../domain/package-reference.policy';
import type { PackageStateName } from '../../domain/package-state.types';

export interface ClassifiedPackage {
    readonly id: string;
    readonly tenantId: string;
    readonly trackingCode: string;
    readonly state: PackageStateName;
    readonly zoneId: string;
    readonly sectorId: string | null;
}

export interface PackageClassificationContext {
    readonly tenantId: string;
    readonly actorUserId: string;
    readonly correlationId: string;
}

export type ClassifyPackageOutcome =
    | { readonly ok: true; readonly package: ClassifiedPackage }
    | { readonly ok: false; readonly code: 'PACKAGE_NOT_FOUND' };

export interface PackageClassificationPort {
    loadClassificationReferences(
        tenantId: string,
        query: PackageClassificationData,
    ): Promise<PackageClassificationReferenceSnapshot>;

    /**
     * Persiste de forma atómica: transición de estado (REGISTERED -> CLASSIFIED),
     * actualización de zoneId y sectorId, registro en PackageStatusHistory y
     * evento PackageClassified en OutboxEvent.
     */
    classifyAtomically(
        context: PackageClassificationContext,
        packageId: string,
        data: PackageClassificationData,
        operation: PackageLifecycleOperation,
    ): Promise<ClassifyPackageOutcome>;
}
