import { PackageNotFoundError } from '../domain/package-errors';
import { PackageGeocodingPolicy } from '../domain/package-geocoding.policy';
import type {
    PackageGeocodingDiagnostic,
    PackageGeocodingResolutionStatus,
} from '../domain/package-geocoding.types';
import type { RoadProfile } from '../../geocoding/domain/network-attachment.types';
import {
    PackageQueryPort,
    type PackageDetail,
    type PackageDetailSnapshot,
} from './ports/package-query.port';
import type {
    MunicipalityGeocodingTarget,
    PackageGeocodingConfigPort,
} from './ports/package-geocoding-config.port';

export class GetPackageDetailUseCase {
    constructor(
        private readonly packages: PackageQueryPort,
        private readonly config?: PackageGeocodingConfigPort,
    ) {}

    async execute(tenantId: string, packageId: string): Promise<PackageDetail> {
        const snapshot = await this.packages.findByTenantAndId(
            tenantId,
            packageId,
        );
        if (!snapshot) {
            throw new PackageNotFoundError(packageId);
        }

        const currentTarget =
            this.config && snapshot.municipalityCode
                ? await this.config.findTargetForMunicipality(
                      tenantId,
                      snapshot.municipalityCode,
                  )
                : null;

        const geocoding = this.evaluateDiagnostic(snapshot, currentTarget);

        return {
            id: snapshot.id,
            trackingCode: snapshot.trackingCode,
            state: snapshot.state,
            priority: snapshot.priority,
            weightKg: snapshot.weightKg,
            volumeM3: snapshot.volumeM3,
            lengthCm: snapshot.lengthCm,
            widthCm: snapshot.widthCm,
            heightCm: snapshot.heightCm,
            deadline: snapshot.deadline,
            address: snapshot.address,
            zone: snapshot.zone,
            sector: snapshot.sector,
            shipmentType: snapshot.shipmentType,
            registeredAt: snapshot.registeredAt,
            addressId: snapshot.addressId,
            municipalityCode: snapshot.municipalityCode,
            geocodingAttemptId: snapshot.geocodingAttemptId,
            geocoding,
            candidates: snapshot.candidates ?? [],
            history: snapshot.history ?? [],
        };
    }

    private evaluateDiagnostic(
        snapshot: PackageDetailSnapshot,
        currentTarget: MunicipalityGeocodingTarget | null,
    ): PackageGeocodingDiagnostic | null {
        const candidate = snapshot.geocodingAttempt?.selectedCandidate;
        const rawAttachments = candidate?.networkAttachments ?? [];
        const isDatasetReady =
            snapshot.geocodingAttempt?.isDatasetReady ?? false;

        const liveEvaluation = PackageGeocodingPolicy.evaluateEligibility({
            attemptStatus: snapshot.geocodingAttempt?.status ?? null,
            attemptDatasetId: snapshot.geocodingAttempt?.datasetId ?? null,
            isDatasetReady,
            targetConfig: currentTarget
                ? {
                      datasetId: currentTarget.datasetId,
                      profile: currentTarget.profile,
                      maxAcceptanceRadiusMeters:
                          currentTarget.maxAcceptanceRadiusMeters,
                  }
                : null,
            selectedCandidate: candidate
                ? {
                      id: candidate.id,
                      networkAttachments: rawAttachments,
                  }
                : null,
        });

        const isLiveEligible = liveEvaluation.isEligible;
        const targetAttachment = liveEvaluation.targetAttachment;

        const meta = snapshot.latestDiagnosticAuditMetadata;
        if (
            meta &&
            meta.addressId === snapshot.addressId &&
            (meta.attemptId ?? null) === (snapshot.geocodingAttemptId ?? null)
        ) {
            const validStatus = (
                [
                    'MATCHED',
                    'REVIEW_REQUIRED',
                    'NOT_FOUND',
                    'DATASET_NOT_READY',
                    'UNSUPPORTED_ADDRESS_FORMAT',
                    'NETWORK_ATTACHMENT_NOT_READY',
                ] as const
            ).find((s) => s === meta.status);

            const validEligibility = (['ELIGIBLE', 'INELIGIBLE'] as const).find(
                (e) => e === meta.eligibility,
            );

            if (validStatus && validEligibility) {
                const validProfile =
                    (
                        [
                            'MOTOR_VEHICLE',
                            'MOTORCYCLE',
                            'BICYCLE',
                            'FOOT',
                        ] as const
                    ).find((p) => p === meta.profile) ?? null;

                const validAttachmentStatus =
                    (
                        [
                            'AUTO_ACCEPTED',
                            'REVIEW_REQUIRED',
                            'APPROVED',
                            'REJECTED',
                        ] as const
                    ).find((s) => s === meta.attachmentStatus) ?? null;

                let resolvedStatus: PackageGeocodingResolutionStatus;
                if (
                    snapshot.geocodingAttemptId === null ||
                    snapshot.geocodingAttempt === null
                ) {
                    resolvedStatus = validStatus;
                } else if (isLiveEligible) {
                    resolvedStatus = validStatus;
                } else {
                    resolvedStatus = liveEvaluation.status;
                }

                const resolvedEligibility = isLiveEligible
                    ? 'ELIGIBLE'
                    : 'INELIGIBLE';

                return {
                    status: resolvedStatus,
                    eligibility: resolvedEligibility,
                    attemptId:
                        typeof meta.attemptId === 'string'
                            ? meta.attemptId
                            : null,
                    selectedCandidateId:
                        typeof meta.selectedCandidateId === 'string'
                            ? meta.selectedCandidateId
                            : null,
                    attachmentId: targetAttachment?.id ?? null,
                    attachmentStatus:
                        targetAttachment?.status ??
                        (resolvedEligibility === 'ELIGIBLE'
                            ? validAttachmentStatus
                            : null),
                    unsuitabilityReason:
                        resolvedEligibility === 'ELIGIBLE'
                            ? null
                            : snapshot.geocodingAttemptId === null
                              ? typeof meta.reason === 'string' && meta.reason
                                  ? meta.reason
                                  : resolvedStatus
                              : (liveEvaluation.unsuitabilityReason ??
                                resolvedStatus),
                    datasetId:
                        typeof meta.datasetId === 'string'
                            ? meta.datasetId
                            : null,
                    profile:
                        targetAttachment?.profile ??
                        (currentTarget?.profile as RoadProfile) ??
                        validProfile,
                    directedReachabilityVerified:
                        meta.directedReachabilityVerified === true,
                };
            }
        }

        if (snapshot.geocodingAttempt) {
            return {
                status: liveEvaluation.status,
                eligibility: liveEvaluation.eligibility,
                attemptId: snapshot.geocodingAttempt.id,
                selectedCandidateId:
                    snapshot.geocodingAttempt.selectedCandidateId,
                attachmentId: targetAttachment?.id ?? null,
                attachmentStatus: targetAttachment?.status ?? null,
                unsuitabilityReason: liveEvaluation.unsuitabilityReason,
                datasetId: snapshot.geocodingAttempt.datasetId,
                profile:
                    targetAttachment?.profile ??
                    (currentTarget?.profile as RoadProfile) ??
                    null,
                directedReachabilityVerified: false,
            };
        }

        return null;
    }
}
