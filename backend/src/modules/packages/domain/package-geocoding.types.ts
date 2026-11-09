import type {
    NetworkAttachmentStatus,
    RoadProfile,
} from '../../geocoding/domain/network-attachment.types';

export type PackageGeocodingResolutionStatus =
    | 'MATCHED'
    | 'REVIEW_REQUIRED'
    | 'NOT_FOUND'
    | 'DATASET_NOT_READY'
    | 'UNSUPPORTED_ADDRESS_FORMAT'
    | 'NETWORK_ATTACHMENT_NOT_READY';

export type GeospatialEligibilityStatus = 'ELIGIBLE' | 'INELIGIBLE';

export type ReviewGeocodingDecision = 'APPROVED' | 'REJECTED';

export interface PackageGeocodingDiagnostic {
    readonly status: PackageGeocodingResolutionStatus;
    readonly eligibility: GeospatialEligibilityStatus;
    readonly attemptId: string | null;
    readonly selectedCandidateId: string | null;
    readonly attachmentId: string | null;
    readonly attachmentStatus: NetworkAttachmentStatus | null;
    readonly unsuitabilityReason: string | null;
    readonly datasetId: string | null;
    readonly profile: RoadProfile | null;
    readonly directedReachabilityVerified: boolean;
}

export interface ResolveGeocodingInput {
    readonly tenantId: string;
    readonly packageId: string;
    readonly addressId?: string;
    readonly actorUserId: string;
    readonly correlationId?: string;
    readonly expectedAttemptId?: string | null;
    readonly forceRetry?: boolean;
    readonly operationId?: string;
}

export interface ReviewCandidateInput {
    readonly tenantId: string;
    readonly packageId: string;
    readonly expectedAddressId: string;
    readonly expectedAttemptId: string;
    readonly candidateId: string;
    readonly decision: ReviewGeocodingDecision;
    readonly reason: string;
    readonly reviewerUserId: string;
    readonly correlationId?: string;
    readonly operationId?: string;
}

export interface CorrectAddressInput {
    readonly tenantId: string;
    readonly packageId: string;
    readonly expectedAddressId: string;
    readonly newOriginalText: string;
    readonly newMunicipalityCode: string;
    readonly reason: string;
    readonly actorUserId: string;
    readonly correlationId?: string;
    readonly expectedAttemptId?: string | null;
}

export interface GeocodingEligibilityEvaluationInput {
    readonly attemptStatus: string | null;
    readonly attemptDatasetId: string | null;
    readonly isDatasetReady: boolean;
    readonly targetConfig: {
        readonly datasetId: string;
        readonly profile: RoadProfile;
        readonly maxAcceptanceRadiusMeters: number;
    } | null;
    readonly selectedCandidate: {
        readonly id: string;
        readonly networkAttachments: readonly {
            readonly id: string;
            readonly datasetId: string;
            readonly profile: string;
            readonly status: string;
            readonly accessDistanceMeters: number;
        }[];
    } | null;
}

export interface GeocodingEligibilityEvaluationResult {
    readonly isEligible: boolean;
    readonly eligibility: GeospatialEligibilityStatus;
    readonly status: PackageGeocodingResolutionStatus;
    readonly unsuitabilityReason: string | null;
    readonly targetAttachment: {
        readonly id: string;
        readonly datasetId: string;
        readonly profile: RoadProfile;
        readonly status: NetworkAttachmentStatus;
        readonly accessDistanceMeters: number;
    } | null;
}
