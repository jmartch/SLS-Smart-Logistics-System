export interface PackageListItem {
    readonly id: string;
    readonly trackingCode: string;
    readonly state: string;
    readonly priority: string;
    readonly weightKg: string;
    readonly volumeM3: string;
    readonly address: string;
    readonly zone: string | null;
    readonly sector: string | null;
    readonly shipmentType: string;
    readonly registeredAt: Date | null;
}
export interface PackageHistoryItem {
    readonly fromState: string | null;
    readonly toState: string;
    readonly reasonCode: string | null;
    readonly changedBy: string | null;
    readonly createdAt: Date;
}

import type { PackageGeocodingDiagnostic } from '../../domain/package-geocoding.types';
import type { PackageStateName } from '../../domain/package-state.types';

export interface GeocodingCandidateDetail {
    readonly id: string;
    readonly rank: number;
    readonly score: number;
    readonly latitude: number;
    readonly longitude: number;
    readonly precision: string;
    readonly source: string;
}

export interface PackageAttachmentSnapshot {
    readonly id: string;
    readonly datasetId: string;
    readonly profile: string;
    readonly status: string;
    readonly accessDistanceMeters: number;
}

export interface PackageDetailSnapshot extends PackageListItem {
    readonly lengthCm: string;
    readonly widthCm: string;
    readonly heightCm: string;
    readonly deadline: Date | null;
    readonly addressId: string;
    readonly municipalityCode: string | null;
    readonly geocodingAttemptId: string | null;
    readonly geocodingAttempt: {
        readonly id: string;
        readonly datasetId: string;
        readonly selectedCandidateId: string | null;
        readonly status: string;
        readonly isDatasetReady: boolean;
        readonly selectedCandidate: {
            readonly id: string;
            readonly networkAttachments: readonly PackageAttachmentSnapshot[];
        } | null;
    } | null;
    readonly latestDiagnosticAuditMetadata: Record<string, unknown> | null;
    readonly candidates: readonly GeocodingCandidateDetail[];
    readonly history: readonly PackageHistoryItem[];
}

export interface PackageDetail extends PackageListItem {
    readonly lengthCm: string;
    readonly widthCm: string;
    readonly heightCm: string;
    readonly deadline: Date | null;
    readonly addressId: string;
    readonly municipalityCode?: string | null;
    readonly geocodingAttemptId?: string | null;
    readonly geocoding?: PackageGeocodingDiagnostic | null;
    readonly candidates?: readonly GeocodingCandidateDetail[];
    readonly history: readonly PackageHistoryItem[];
}

export interface PackageListFilter {
    readonly state?: PackageStateName;
}

export abstract class PackageQueryPort {
    abstract listByTenant(
        tenantId: string,
        filter?: PackageListFilter,
    ): Promise<PackageListItem[]>;
    abstract findByTenantAndId(
        tenantId: string,
        packageId: string,
    ): Promise<PackageDetailSnapshot | null>;
}
