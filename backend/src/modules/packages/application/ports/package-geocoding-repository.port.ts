import type {
    PackageGeocodingDiagnostic,
    ReviewGeocodingDecision,
} from '../../domain/package-geocoding.types';

export interface PackageRecordForGeocoding {
    readonly id: string;
    readonly tenantId: string;
    readonly state: string;
    readonly addressId: string;
    readonly geocodingAttemptId: string | null;
    readonly originalText: string;
    readonly municipalityCode: string;
}

export interface GeocodingAttemptRecord {
    readonly id: string;
    readonly tenantId: string;
    readonly addressId: string;
    readonly datasetId: string;
    readonly status: 'MATCHED' | 'REVIEW_REQUIRED' | 'NOT_FOUND';
    readonly selectedCandidateId: string | null;
}

export interface GeocodingCandidateRecord {
    readonly id: string;
    readonly tenantId: string;
    readonly attemptId: string;
    readonly datasetId: string;
    readonly latitude: number;
    readonly longitude: number;
    readonly rank: number;
    readonly score: number;
}

export interface UpdateAttemptDecisionCommand {
    readonly selectedCandidateId: string | null;
    readonly status: 'MATCHED' | 'REVIEW_REQUIRED' | 'NOT_FOUND';
}

export interface SaveGeocodingReviewCommand {
    readonly tenantId: string;
    readonly attemptId: string;
    readonly candidateId: string;
    readonly reviewerId: string;
    readonly decision: ReviewGeocodingDecision;
    readonly reason: string;
}

export interface ExistingReviewRecord {
    readonly id: string;
    readonly decision: ReviewGeocodingDecision;
    readonly candidateId: string;
}

export interface CreateAddressVersionCommand {
    readonly tenantId: string;
    readonly originalText: string;
    readonly municipalityCode: string;
}

export interface UpdatePackageAddressCommand {
    readonly tenantId: string;
    readonly packageId: string;
    readonly addressId: string;
    readonly geocodingAttemptId: null;
}

export interface OperationRecord {
    readonly operationId: string;
    readonly tenantId: string;
    readonly packageId: string;
    readonly payloadHash: string;
    readonly result: PackageGeocodingDiagnostic;
}

export interface SaveOperationCommand {
    readonly operationId: string;
    readonly tenantId: string;
    readonly packageId: string;
    readonly payloadHash: string;
    readonly result: PackageGeocodingDiagnostic;
}

export interface GeocodingResolutionSnapshot {
    readonly attemptId: string;
    readonly attemptStatus: string;
    readonly attemptDatasetId: string;
    readonly isDatasetReady: boolean;
    readonly selectedCandidateId: string | null;
    readonly networkAttachments: readonly {
        readonly id: string;
        readonly datasetId: string;
        readonly profile: string;
        readonly status: string;
        readonly accessDistanceMeters: number;
    }[];
}

export interface PackageGeocodingRepositoryPort {
    findPackageForUpdate(
        tenantId: string,
        packageId: string,
    ): Promise<PackageRecordForGeocoding | null>;

    findOperation(
        tenantId: string,
        operationId: string,
    ): Promise<OperationRecord | null>;

    saveOperation(command: SaveOperationCommand): Promise<void>;

    linkGeocodingAttempt(
        tenantId: string,
        packageId: string,
        attemptId: string,
    ): Promise<void>;

    hasActiveAssignment(tenantId: string, packageId: string): Promise<boolean>;

    isAttemptConsumedByRouteStop(
        tenantId: string,
        attemptId: string,
    ): Promise<boolean>;

    findAttemptById(
        tenantId: string,
        attemptId: string,
    ): Promise<GeocodingAttemptRecord | null>;

    updateAttemptDecision(
        tenantId: string,
        attemptId: string,
        update: UpdateAttemptDecisionCommand,
    ): Promise<void>;

    findCandidateById(
        tenantId: string,
        candidateId: string,
    ): Promise<GeocodingCandidateRecord | null>;

    findSelectedCandidateForAttempt(
        tenantId: string,
        attemptId: string,
    ): Promise<GeocodingCandidateRecord | null>;

    findResolutionSnapshot(
        tenantId: string,
        packageId: string,
    ): Promise<GeocodingResolutionSnapshot | null>;

    findLatestReview(
        tenantId: string,
        attemptId: string,
        candidateId: string,
    ): Promise<ExistingReviewRecord | null>;

    saveGeocodingReview(command: SaveGeocodingReviewCommand): Promise<void>;

    createAddressVersion(
        command: CreateAddressVersionCommand,
    ): Promise<{ readonly id: string }>;

    updatePackageAddress(command: UpdatePackageAddressCommand): Promise<void>;
}
