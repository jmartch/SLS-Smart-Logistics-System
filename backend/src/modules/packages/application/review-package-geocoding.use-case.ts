import type { SavedNetworkAttachmentRecord } from '../../geocoding/application/ports/network-attachment.port';
import { NetworkAttachmentPolicy } from '../../geocoding/domain/network-attachment.policy';
import {
    PackageGeocodingCandidateNotFoundError,
    PackageGeocodingValidationError,
    PackageNotFoundError,
    PackageOperationIdConflictError,
} from '../domain/package-errors';
import { PackageGeocodingPolicy } from '../domain/package-geocoding.policy';
import type {
    PackageGeocodingDiagnostic,
    ReviewCandidateInput,
} from '../domain/package-geocoding.types';
import { emitDiagnostic } from './helpers/package-geocoding-diagnostic.helper';
import type { PackageGeocodingConfigPort } from './ports/package-geocoding-config.port';
import type { PackageGeocodingUnitOfWorkPort } from './ports/package-geocoding.uow.port';

export class ReviewPackageGeocodingUseCase {
    constructor(
        private readonly uow: PackageGeocodingUnitOfWorkPort,
        private readonly configPort: PackageGeocodingConfigPort,
    ) {}

    async execute(
        input: ReviewCandidateInput,
    ): Promise<PackageGeocodingDiagnostic> {
        PackageGeocodingPolicy.validateReviewInput(input);

        return this.uow.runInTransaction(input.tenantId, async (session) => {
            const payloadHash = JSON.stringify({
                action: 'REVIEW',
                tenantId: input.tenantId,
                packageId: input.packageId,
                expectedAddressId: input.expectedAddressId,
                expectedAttemptId:
                    input.expectedAttemptId === undefined
                        ? '__UNDEFINED__'
                        : input.expectedAttemptId,
                candidateId: input.candidateId,
                decision: input.decision,
                reason: input.reason,
            });

            if (input.operationId) {
                const existingOp =
                    await session.packageRepository.findOperation(
                        input.tenantId,
                        input.operationId,
                    );
                if (existingOp) {
                    if (existingOp.payloadHash !== payloadHash) {
                        throw new PackageOperationIdConflictError(
                            input.operationId,
                        );
                    }
                    return existingOp.result;
                }
            }

            const pkg = await session.packageRepository.findPackageForUpdate(
                input.tenantId,
                input.packageId,
            );

            if (!pkg) {
                throw new PackageNotFoundError(input.packageId);
            }

            PackageGeocodingPolicy.validateOperationAllowedState(
                pkg.id,
                pkg.state,
                'review geocoding',
            );

            const hasActiveAssignment =
                await session.packageRepository.hasActiveAssignment(
                    input.tenantId,
                    pkg.id,
                );
            PackageGeocodingPolicy.validateNoActiveAssignment(
                pkg.id,
                hasActiveAssignment,
            );

            PackageGeocodingPolicy.validateAddressReference(
                pkg.id,
                pkg.addressId,
                input.expectedAddressId,
            );

            PackageGeocodingPolicy.validateAttemptReference(
                pkg.id,
                pkg.geocodingAttemptId,
                input.expectedAttemptId,
            );

            const isConsumed =
                await session.packageRepository.isAttemptConsumedByRouteStop(
                    input.tenantId,
                    input.expectedAttemptId,
                );
            PackageGeocodingPolicy.validateAttemptNotHistorical(
                input.expectedAttemptId,
                isConsumed,
            );

            const attempt = await session.packageRepository.findAttemptById(
                input.tenantId,
                input.expectedAttemptId,
            );

            if (
                !attempt ||
                attempt.addressId !== pkg.addressId ||
                attempt.tenantId !== input.tenantId
            ) {
                throw new PackageGeocodingValidationError(
                    'Geocoding attempt was not found or does not match package address',
                    'expectedAttemptId',
                );
            }

            const targetConfig =
                await this.configPort.findTargetForMunicipality(
                    input.tenantId,
                    pkg.municipalityCode,
                );

            if (!targetConfig) {
                const diag = await emitDiagnostic(session.auditPort, {
                    tenantId: input.tenantId,
                    packageId: pkg.id,
                    addressId: pkg.addressId,
                    status: 'DATASET_NOT_READY',
                    attemptId: input.expectedAttemptId,
                    selectedCandidateId: null,
                    attachmentId: null,
                    attachmentStatus: null,
                    unsuitabilityReason:
                        'No ready dataset configured for municipality',
                    datasetId: null,
                    profile: null,
                    actorUserId: input.reviewerUserId,
                    correlationId: input.correlationId,
                });

                if (input.operationId) {
                    await session.packageRepository.saveOperation({
                        operationId: input.operationId,
                        tenantId: input.tenantId,
                        packageId: pkg.id,
                        payloadHash,
                        result: diag,
                    });
                }

                return diag;
            }

            if (attempt.datasetId !== targetConfig.datasetId) {
                throw new PackageGeocodingValidationError(
                    'Attempt dataset is incompatible with active municipality target dataset',
                    'expectedAttemptId',
                );
            }

            const candidate = await session.packageRepository.findCandidateById(
                input.tenantId,
                input.candidateId,
            );

            if (
                !candidate ||
                candidate.attemptId !== input.expectedAttemptId ||
                candidate.tenantId !== input.tenantId
            ) {
                throw new PackageGeocodingCandidateNotFoundError(
                    input.candidateId,
                    input.expectedAttemptId,
                );
            }

            if (candidate.datasetId !== targetConfig.datasetId) {
                throw new PackageGeocodingValidationError(
                    'Candidate dataset is incompatible with active municipality target dataset',
                    'candidateId',
                );
            }

            await session.packageRepository.saveGeocodingReview({
                tenantId: input.tenantId,
                attemptId: input.expectedAttemptId,
                candidateId: candidate.id,
                reviewerId: input.reviewerUserId,
                decision: input.decision,
                reason: input.reason,
            });

            await session.auditPort.recordReview({
                tenantId: input.tenantId,
                packageId: pkg.id,
                attemptId: input.expectedAttemptId,
                candidateId: candidate.id,
                decision: input.decision,
                reason: input.reason,
                reviewerUserId: input.reviewerUserId,
                correlationId: input.correlationId,
            });

            if (input.decision === 'REJECTED') {
                await session.packageRepository.updateAttemptDecision(
                    input.tenantId,
                    input.expectedAttemptId,
                    {
                        selectedCandidateId: null,
                        status: 'REVIEW_REQUIRED',
                    },
                );

                const diag = await emitDiagnostic(session.auditPort, {
                    tenantId: input.tenantId,
                    packageId: pkg.id,
                    addressId: pkg.addressId,
                    status: 'REVIEW_REQUIRED',
                    attemptId: input.expectedAttemptId,
                    selectedCandidateId: null,
                    attachmentId: null,
                    attachmentStatus: null,
                    unsuitabilityReason: 'Candidate was rejected by reviewer',
                    datasetId: targetConfig.datasetId,
                    profile: targetConfig.profile,
                    actorUserId: input.reviewerUserId,
                    correlationId: input.correlationId,
                });

                if (input.operationId) {
                    await session.packageRepository.saveOperation({
                        operationId: input.operationId,
                        tenantId: input.tenantId,
                        packageId: pkg.id,
                        payloadHash,
                        result: diag,
                    });
                }

                return diag;
            }

            await session.packageRepository.updateAttemptDecision(
                input.tenantId,
                input.expectedAttemptId,
                {
                    selectedCandidateId: candidate.id,
                    status: 'MATCHED',
                },
            );

            const candidateNodes =
                await session.networkAttachmentPort.findCandidateNodes({
                    datasetId: targetConfig.datasetId,
                    profile: targetConfig.profile,
                    latitude: candidate.latitude,
                    longitude: candidate.longitude,
                    searchRadiusMeters:
                        targetConfig.maxReviewRadiusMeters ??
                        targetConfig.maxAcceptanceRadiusMeters,
                });

            const attachmentDecision = NetworkAttachmentPolicy.evaluate({
                expectedDatasetId: targetConfig.datasetId,
                profile: targetConfig.profile,
                targetLatitude: candidate.latitude,
                targetLongitude: candidate.longitude,
                candidateNodes,
                config: {
                    maxAcceptanceRadiusMeters:
                        targetConfig.maxAcceptanceRadiusMeters,
                    maxReviewRadiusMeters: targetConfig.maxReviewRadiusMeters,
                },
            });

            let savedAttachment: SavedNetworkAttachmentRecord | null = null;
            if (
                attachmentDecision.selectedNodeId &&
                attachmentDecision.snappedLocation &&
                attachmentDecision.accessDistanceMeters !== null
            ) {
                savedAttachment =
                    await session.networkAttachmentPort.saveAttachment({
                        tenantId: input.tenantId,
                        datasetId: targetConfig.datasetId,
                        geocodingCandidateId: candidate.id,
                        profile: targetConfig.profile,
                        roadNodeId: attachmentDecision.selectedNodeId,
                        roadEdgeId: null,
                        snappedLatitude:
                            attachmentDecision.snappedLocation.latitude,
                        snappedLongitude:
                            attachmentDecision.snappedLocation.longitude,
                        accessDistanceMeters:
                            attachmentDecision.accessDistanceMeters,
                        status: attachmentDecision.status,
                        reviewedByUserId: null,
                        reviewReason: null,
                        reviewedAt: null,
                    });
            }

            const isEligible =
                attachmentDecision.status === 'AUTO_ACCEPTED' ||
                attachmentDecision.status === 'APPROVED';

            const diag = await emitDiagnostic(session.auditPort, {
                tenantId: input.tenantId,
                packageId: pkg.id,
                addressId: pkg.addressId,
                status: isEligible ? 'MATCHED' : 'NETWORK_ATTACHMENT_NOT_READY',
                attemptId: input.expectedAttemptId,
                selectedCandidateId: candidate.id,
                attachmentId: savedAttachment?.id ?? null,
                attachmentStatus:
                    savedAttachment?.status ?? attachmentDecision.status,
                unsuitabilityReason: isEligible
                    ? null
                    : (attachmentDecision.reasonCode ??
                      'Network attachment requires review'),
                datasetId: targetConfig.datasetId,
                profile: targetConfig.profile,
                actorUserId: input.reviewerUserId,
                correlationId: input.correlationId,
            });

            if (input.operationId) {
                await session.packageRepository.saveOperation({
                    operationId: input.operationId,
                    tenantId: input.tenantId,
                    packageId: pkg.id,
                    payloadHash,
                    result: diag,
                });
            }

            return diag;
        });
    }
}
