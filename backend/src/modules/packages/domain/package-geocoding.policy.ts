import {
    PackageActiveAssignmentConflictError,
    PackageGeocodingReferenceMismatchError,
    PackageGeocodingValidationError,
    PackageHistoricalAttemptLockedError,
    PackageStateConflictError,
} from './package-errors';
import type {
    CorrectAddressInput,
    GeocodingEligibilityEvaluationInput,
    GeocodingEligibilityEvaluationResult,
    ReviewCandidateInput,
} from './package-geocoding.types';

const ALLOWED_OPERATIONAL_STATES: readonly string[] = [
    'REGISTERED',
    'CLASSIFIED',
    'PENDING_ASSIGNMENT',
];

export class PackageGeocodingPolicy {
    static validateOperationAllowedState(
        packageId: string,
        packageState: string,
        operationName: string,
    ): void {
        if (!ALLOWED_OPERATIONAL_STATES.includes(packageState)) {
            throw new PackageStateConflictError(
                packageId,
                packageState,
                operationName,
            );
        }
    }

    static validateNoActiveAssignment(
        packageId: string,
        hasActiveAssignment: boolean,
    ): void {
        if (hasActiveAssignment) {
            throw new PackageActiveAssignmentConflictError(packageId);
        }
    }

    static validateAddressReference(
        packageId: string,
        actualAddressId: string,
        expectedAddressId: string,
    ): void {
        if (actualAddressId !== expectedAddressId) {
            throw new PackageGeocodingReferenceMismatchError(
                packageId,
                'address',
                expectedAddressId,
                actualAddressId,
            );
        }
    }

    static validateAttemptReference(
        packageId: string,
        actualAttemptId: string | null,
        expectedAttemptId: string | null | undefined,
    ): void {
        if (expectedAttemptId === undefined) {
            return;
        }

        if (actualAttemptId !== expectedAttemptId) {
            throw new PackageGeocodingReferenceMismatchError(
                packageId,
                'geocodingAttempt',
                expectedAttemptId === null ? 'null' : expectedAttemptId,
                actualAttemptId,
            );
        }
    }

    static validateAttemptNotHistorical(
        attemptId: string,
        isConsumedByRouteStop: boolean,
    ): void {
        if (isConsumedByRouteStop) {
            throw new PackageHistoricalAttemptLockedError(attemptId);
        }
    }

    static validateReviewInput(input: ReviewCandidateInput): void {
        if (input.decision !== 'APPROVED' && input.decision !== 'REJECTED') {
            throw new PackageGeocodingValidationError(
                "Review decision must be 'APPROVED' or 'REJECTED'",
                'decision',
            );
        }

        if (!input.candidateId || input.candidateId.trim().length === 0) {
            throw new PackageGeocodingValidationError(
                'Candidate ID is required',
                'candidateId',
            );
        }

        if (!input.reason || input.reason.trim().length === 0) {
            throw new PackageGeocodingValidationError(
                'Review reason cannot be empty',
                'reason',
            );
        }

        if (!input.reviewerUserId || input.reviewerUserId.trim().length === 0) {
            throw new PackageGeocodingValidationError(
                'Reviewer user ID is required',
                'reviewerUserId',
            );
        }
    }

    static validateAddressCorrectionInput(input: CorrectAddressInput): void {
        if (
            !input.newOriginalText ||
            input.newOriginalText.trim().length === 0
        ) {
            throw new PackageGeocodingValidationError(
                'New address text cannot be empty',
                'newOriginalText',
            );
        }

        if (
            !input.newMunicipalityCode ||
            input.newMunicipalityCode.trim().length === 0
        ) {
            throw new PackageGeocodingValidationError(
                'New municipality code cannot be empty',
                'newMunicipalityCode',
            );
        }

        if (!input.reason || input.reason.trim().length === 0) {
            throw new PackageGeocodingValidationError(
                'Correction reason cannot be empty',
                'reason',
            );
        }

        if (!input.actorUserId || input.actorUserId.trim().length === 0) {
            throw new PackageGeocodingValidationError(
                'Actor user ID is required',
                'actorUserId',
            );
        }
    }

    static evaluateEligibility(
        input: GeocodingEligibilityEvaluationInput,
    ): GeocodingEligibilityEvaluationResult {
        if (!input.attemptStatus) {
            return {
                isEligible: false,
                eligibility: 'INELIGIBLE',
                status: 'NOT_FOUND',
                unsuitabilityReason: 'MISSING_GEOCODING_ATTEMPT',
                targetAttachment: null,
            };
        }

        if (input.attemptStatus === 'REVIEW_REQUIRED') {
            return {
                isEligible: false,
                eligibility: 'INELIGIBLE',
                status: 'REVIEW_REQUIRED',
                unsuitabilityReason: 'REVIEW_REQUIRED',
                targetAttachment: null,
            };
        }

        if (input.attemptStatus === 'NOT_FOUND') {
            return {
                isEligible: false,
                eligibility: 'INELIGIBLE',
                status: 'NOT_FOUND',
                unsuitabilityReason: 'NOT_FOUND',
                targetAttachment: null,
            };
        }

        if (input.attemptStatus === 'UNSUPPORTED_ADDRESS_FORMAT') {
            return {
                isEligible: false,
                eligibility: 'INELIGIBLE',
                status: 'UNSUPPORTED_ADDRESS_FORMAT',
                unsuitabilityReason: 'UNSUPPORTED_ADDRESS_FORMAT',
                targetAttachment: null,
            };
        }

        if (input.attemptStatus !== 'MATCHED') {
            return {
                isEligible: false,
                eligibility: 'INELIGIBLE',
                status: 'NOT_FOUND',
                unsuitabilityReason: input.attemptStatus,
                targetAttachment: null,
            };
        }

        if (!input.targetConfig) {
            return {
                isEligible: false,
                eligibility: 'INELIGIBLE',
                status: 'DATASET_NOT_READY',
                unsuitabilityReason: 'DATASET_NOT_READY',
                targetAttachment: null,
            };
        }

        if (!input.isDatasetReady) {
            return {
                isEligible: false,
                eligibility: 'INELIGIBLE',
                status: 'DATASET_NOT_READY',
                unsuitabilityReason: 'DATASET_NOT_READY',
                targetAttachment: null,
            };
        }

        if (input.attemptDatasetId !== input.targetConfig.datasetId) {
            return {
                isEligible: false,
                eligibility: 'INELIGIBLE',
                status: 'DATASET_NOT_READY',
                unsuitabilityReason: 'DATASET_MISMATCH',
                targetAttachment: null,
            };
        }

        const candidate = input.selectedCandidate;
        if (!candidate) {
            return {
                isEligible: false,
                eligibility: 'INELIGIBLE',
                status: 'NETWORK_ATTACHMENT_NOT_READY',
                unsuitabilityReason: 'MISSING_SELECTED_CANDIDATE',
                targetAttachment: null,
            };
        }

        const requiredProfile = input.targetConfig.profile;
        const matchingAttachment = candidate.networkAttachments.find(
            (a) =>
                a.profile === requiredProfile &&
                a.datasetId === input.targetConfig!.datasetId,
        );

        if (!matchingAttachment) {
            return {
                isEligible: false,
                eligibility: 'INELIGIBLE',
                status: 'NETWORK_ATTACHMENT_NOT_READY',
                unsuitabilityReason: 'NETWORK_ATTACHMENT_NOT_READY',
                targetAttachment: null,
            };
        }

        const validAttachmentStatus =
            (
                [
                    'AUTO_ACCEPTED',
                    'REVIEW_REQUIRED',
                    'APPROVED',
                    'REJECTED',
                ] as const
            ).find((s) => s === matchingAttachment.status) ?? null;

        const typedAttachment = {
            id: matchingAttachment.id,
            datasetId: matchingAttachment.datasetId,
            profile: requiredProfile,
            status: validAttachmentStatus ?? 'REVIEW_REQUIRED',
            accessDistanceMeters: matchingAttachment.accessDistanceMeters,
        };

        const isAccepted =
            matchingAttachment.status === 'AUTO_ACCEPTED' ||
            matchingAttachment.status === 'APPROVED';

        if (!isAccepted) {
            return {
                isEligible: false,
                eligibility: 'INELIGIBLE',
                status: 'NETWORK_ATTACHMENT_NOT_READY',
                unsuitabilityReason: 'NETWORK_ATTACHMENT_NOT_READY',
                targetAttachment: typedAttachment,
            };
        }

        const isWithinRadius =
            matchingAttachment.accessDistanceMeters <=
            input.targetConfig.maxAcceptanceRadiusMeters;

        if (!isWithinRadius) {
            return {
                isEligible: false,
                eligibility: 'INELIGIBLE',
                status: 'NETWORK_ATTACHMENT_NOT_READY',
                unsuitabilityReason: 'NETWORK_ATTACHMENT_NOT_READY',
                targetAttachment: typedAttachment,
            };
        }

        return {
            isEligible: true,
            eligibility: 'ELIGIBLE',
            status: 'MATCHED',
            unsuitabilityReason: null,
            targetAttachment: typedAttachment,
        };
    }
}
