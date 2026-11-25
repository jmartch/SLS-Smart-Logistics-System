import type { SavedNetworkAttachmentRecord } from '../../geocoding/application/ports/network-attachment.port';
import type { GeocodeAddressResult } from '../../geocoding/application/geocode-address.service';
import { GeocodeAddressService } from '../../geocoding/application/geocode-address.service';
import { InvalidAddressError } from '../../geocoding/domain/invalid-address.error';
import { NetworkAttachmentPolicy } from '../../geocoding/domain/network-attachment.policy';
import {
    PackageGeocodingValidationError,
    PackageNotFoundError,
    PackageOperationIdConflictError,
} from '../domain/package-errors';
import { PackageGeocodingPolicy } from '../domain/package-geocoding.policy';
import type {
    PackageGeocodingDiagnostic,
    ResolveGeocodingInput,
} from '../domain/package-geocoding.types';
import { emitDiagnostic } from './helpers/package-geocoding-diagnostic.helper';
import type { PackageGeocodingConfigPort } from './ports/package-geocoding-config.port';
import type {
    PackageGeocodingSession,
    PackageGeocodingUnitOfWorkPort,
} from './ports/package-geocoding.uow.port';

export class ResolvePackageGeocodingUseCase {
    constructor(
        private readonly configPort: PackageGeocodingConfigPort,
        private readonly uow?: PackageGeocodingUnitOfWorkPort,
    ) {}

    async execute(
        input: ResolveGeocodingInput,
    ): Promise<PackageGeocodingDiagnostic> {
        if (!this.uow) {
            throw new Error(
                'A unit of work is required for standalone execution',
            );
        }

        return this.uow.runInTransaction(input.tenantId, (session) =>
            this.executeInSession(session, input),
        );
    }

    async executeInSession(
        session: PackageGeocodingSession,
        input: ResolveGeocodingInput,
    ): Promise<PackageGeocodingDiagnostic> {
        const payloadHash = JSON.stringify({
            action: 'RESOLVE',
            tenantId: input.tenantId,
            packageId: input.packageId,
            addressId:
                input.addressId === undefined
                    ? '__UNDEFINED__'
                    : input.addressId,
            expectedAttemptId:
                input.expectedAttemptId === undefined
                    ? '__UNDEFINED__'
                    : input.expectedAttemptId,
            forceRetry: Boolean(input.forceRetry),
        });

        if (input.operationId) {
            const existingOp = await session.packageRepository.findOperation(
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
            'resolve geocoding',
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

        if (input.addressId) {
            PackageGeocodingPolicy.validateAddressReference(
                pkg.id,
                pkg.addressId,
                input.addressId,
            );
        }

        PackageGeocodingPolicy.validateAttemptReference(
            pkg.id,
            pkg.geocodingAttemptId,
            input.expectedAttemptId,
        );

        const targetConfig = await this.configPort.findTargetForMunicipality(
            input.tenantId,
            pkg.municipalityCode,
        );

        if (!targetConfig) {
            const diag = await emitDiagnostic(session.auditPort, {
                tenantId: input.tenantId,
                packageId: pkg.id,
                addressId: pkg.addressId,
                status: 'DATASET_NOT_READY',
                attemptId: null,
                selectedCandidateId: null,
                attachmentId: null,
                attachmentStatus: null,
                unsuitabilityReason:
                    'No ready dataset configured for municipality',
                datasetId: null,
                profile: null,
                actorUserId: input.actorUserId,
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

        if (!input.forceRetry && pkg.geocodingAttemptId) {
            const snapshot =
                await session.packageRepository.findResolutionSnapshot(
                    input.tenantId,
                    pkg.id,
                );
            if (
                snapshot !== null &&
                snapshot.attemptDatasetId === targetConfig.datasetId
            ) {
                const liveEvaluation =
                    PackageGeocodingPolicy.evaluateEligibility({
                        attemptStatus: snapshot.attemptStatus,
                        attemptDatasetId: snapshot.attemptDatasetId,
                        isDatasetReady: snapshot.isDatasetReady,
                        targetConfig: {
                            datasetId: targetConfig.datasetId,
                            profile: targetConfig.profile,
                            maxAcceptanceRadiusMeters:
                                targetConfig.maxAcceptanceRadiusMeters,
                        },
                        selectedCandidate: snapshot.selectedCandidateId
                            ? {
                                  id: snapshot.selectedCandidateId,
                                  networkAttachments:
                                      snapshot.networkAttachments,
                              }
                            : null,
                    });

                if (
                    liveEvaluation.isEligible &&
                    liveEvaluation.targetAttachment?.profile ===
                        targetConfig.profile
                ) {
                    const activeResolution: PackageGeocodingDiagnostic = {
                        status: liveEvaluation.status,
                        eligibility: liveEvaluation.eligibility,
                        attemptId: snapshot.attemptId,
                        selectedCandidateId: snapshot.selectedCandidateId,
                        attachmentId:
                            liveEvaluation.targetAttachment?.id ?? null,
                        attachmentStatus:
                            liveEvaluation.targetAttachment?.status ?? null,
                        unsuitabilityReason: liveEvaluation.unsuitabilityReason,
                        datasetId: snapshot.attemptDatasetId,
                        profile:
                            liveEvaluation.targetAttachment?.profile ?? null,
                        directedReachabilityVerified: false,
                    };

                    if (input.operationId) {
                        await session.packageRepository.saveOperation({
                            operationId: input.operationId,
                            tenantId: input.tenantId,
                            packageId: pkg.id,
                            payloadHash,
                            result: activeResolution,
                        });
                    }
                    return activeResolution;
                }
            }
        }

        const geocoder = new GeocodeAddressService(
            session.geocodingAddressPort,
            session.geocodingCatalogPort,
            session.geocodingAttemptPort,
        );

        let geocodeResult: GeocodeAddressResult;
        try {
            geocodeResult = await geocoder.execute({
                tenantId: input.tenantId,
                addressId: pkg.addressId,
                datasetId: targetConfig.datasetId,
            });
        } catch (error) {
            if (
                error instanceof InvalidAddressError &&
                error.code === 'UNSUPPORTED_ADDRESS_FORMAT'
            ) {
                const diag = await emitDiagnostic(session.auditPort, {
                    tenantId: input.tenantId,
                    packageId: pkg.id,
                    addressId: pkg.addressId,
                    status: 'UNSUPPORTED_ADDRESS_FORMAT',
                    attemptId: null,
                    selectedCandidateId: null,
                    attachmentId: null,
                    attachmentStatus: null,
                    unsuitabilityReason: error.message,
                    datasetId: targetConfig.datasetId,
                    profile: targetConfig.profile,
                    actorUserId: input.actorUserId,
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

            throw error;
        }

        if (geocodeResult.kind === 'DATASET_NOT_READY') {
            const diag = await emitDiagnostic(session.auditPort, {
                tenantId: input.tenantId,
                packageId: pkg.id,
                addressId: pkg.addressId,
                status: 'DATASET_NOT_READY',
                attemptId: null,
                selectedCandidateId: null,
                attachmentId: null,
                attachmentStatus: null,
                unsuitabilityReason: 'Geocoding dataset is not ready',
                datasetId: targetConfig.datasetId,
                profile: targetConfig.profile,
                actorUserId: input.actorUserId,
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

        if (geocodeResult.kind === 'ADDRESS_NOT_FOUND') {
            throw new PackageGeocodingValidationError(
                `Address record '${pkg.addressId}' was not found for geocoding`,
                'addressId',
            );
        }

        const { attemptId, decision } = geocodeResult;

        await session.packageRepository.linkGeocodingAttempt(
            input.tenantId,
            pkg.id,
            attemptId,
        );

        if (decision.status === 'NOT_FOUND') {
            const diag = await emitDiagnostic(session.auditPort, {
                tenantId: input.tenantId,
                packageId: pkg.id,
                addressId: pkg.addressId,
                status: 'NOT_FOUND',
                attemptId,
                selectedCandidateId: null,
                attachmentId: null,
                attachmentStatus: null,
                unsuitabilityReason: 'No matching geocoding candidates found',
                datasetId: targetConfig.datasetId,
                profile: targetConfig.profile,
                actorUserId: input.actorUserId,
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

        if (decision.status === 'REVIEW_REQUIRED') {
            const diag = await emitDiagnostic(session.auditPort, {
                tenantId: input.tenantId,
                packageId: pkg.id,
                addressId: pkg.addressId,
                status: 'REVIEW_REQUIRED',
                attemptId,
                selectedCandidateId: null,
                attachmentId: null,
                attachmentStatus: null,
                unsuitabilityReason:
                    'Ambiguous geocoding candidates require human review',
                datasetId: targetConfig.datasetId,
                profile: targetConfig.profile,
                actorUserId: input.actorUserId,
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

        let selectedCandidate =
            await session.packageRepository.findSelectedCandidateForAttempt(
                input.tenantId,
                attemptId,
            );

        if (!selectedCandidate && geocodeResult.selectedCandidateId) {
            selectedCandidate =
                await session.packageRepository.findCandidateById(
                    input.tenantId,
                    geocodeResult.selectedCandidateId,
                );
        }

        if (
            !selectedCandidate ||
            selectedCandidate.tenantId !== input.tenantId ||
            selectedCandidate.attemptId !== attemptId ||
            selectedCandidate.datasetId !== targetConfig.datasetId
        ) {
            throw new Error(
                'Selected geocoding candidate is missing or inconsistent with tenant, attempt or target dataset',
            );
        }

        const candidateNodes =
            await session.networkAttachmentPort.findCandidateNodes({
                datasetId: targetConfig.datasetId,
                profile: targetConfig.profile,
                latitude: selectedCandidate.latitude,
                longitude: selectedCandidate.longitude,
                searchRadiusMeters:
                    targetConfig.maxReviewRadiusMeters ??
                    targetConfig.maxAcceptanceRadiusMeters,
            });

        const attachmentDecision = NetworkAttachmentPolicy.evaluate({
            expectedDatasetId: targetConfig.datasetId,
            profile: targetConfig.profile,
            targetLatitude: selectedCandidate.latitude,
            targetLongitude: selectedCandidate.longitude,
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
                    geocodingCandidateId: selectedCandidate.id,
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

        const finalDiagnostic = await emitDiagnostic(session.auditPort, {
            tenantId: input.tenantId,
            packageId: pkg.id,
            addressId: pkg.addressId,
            status: isEligible ? 'MATCHED' : 'NETWORK_ATTACHMENT_NOT_READY',
            attemptId,
            selectedCandidateId: selectedCandidate.id,
            attachmentId: savedAttachment?.id ?? null,
            attachmentStatus:
                savedAttachment?.status ?? attachmentDecision.status,
            unsuitabilityReason: isEligible
                ? null
                : (attachmentDecision.reasonCode ??
                  'Network attachment requires review'),
            datasetId: targetConfig.datasetId,
            profile: targetConfig.profile,
            actorUserId: input.actorUserId,
            correlationId: input.correlationId,
        });

        if (input.operationId) {
            await session.packageRepository.saveOperation({
                operationId: input.operationId,
                tenantId: input.tenantId,
                packageId: pkg.id,
                payloadHash,
                result: finalDiagnostic,
            });
        }

        return finalDiagnostic;
    }
}
