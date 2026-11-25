import type {
    NetworkAttachmentStatus,
    RoadProfile,
} from '../../../geocoding/domain/network-attachment.types';
import type {
    PackageGeocodingDiagnostic,
    PackageGeocodingResolutionStatus,
} from '../../domain/package-geocoding.types';
import type { PackageGeocodingAuditPort } from '../ports/package-geocoding-audit.port';

export interface EmitDiagnosticParams {
    readonly tenantId: string;
    readonly packageId: string;
    readonly addressId: string;
    readonly status: PackageGeocodingResolutionStatus;
    readonly attemptId: string | null;
    readonly selectedCandidateId: string | null;
    readonly attachmentId: string | null;
    readonly attachmentStatus: NetworkAttachmentStatus | null;
    readonly unsuitabilityReason: string | null;
    readonly datasetId: string | null;
    readonly profile: RoadProfile | null;
    readonly actorUserId: string;
    readonly correlationId?: string;
}

export async function emitDiagnostic(
    auditPort: PackageGeocodingAuditPort,
    params: EmitDiagnosticParams,
): Promise<PackageGeocodingDiagnostic> {
    const isEligible = params.status === 'MATCHED';
    const diagnostic: PackageGeocodingDiagnostic = {
        status: params.status,
        eligibility: isEligible ? 'ELIGIBLE' : 'INELIGIBLE',
        attemptId: params.attemptId,
        selectedCandidateId: params.selectedCandidateId,
        attachmentId: params.attachmentId,
        attachmentStatus: params.attachmentStatus,
        unsuitabilityReason: params.unsuitabilityReason,
        datasetId: params.datasetId,
        profile: params.profile,
        directedReachabilityVerified: false,
    };

    await auditPort.recordDiagnostic({
        tenantId: params.tenantId,
        packageId: params.packageId,
        addressId: params.addressId,
        attemptId: params.attemptId,
        selectedCandidateId: params.selectedCandidateId,
        attachmentId: params.attachmentId,
        attachmentStatus: params.attachmentStatus,
        datasetId: params.datasetId,
        profile: params.profile,
        status: diagnostic.status,
        eligibility: diagnostic.eligibility,
        reason: diagnostic.unsuitabilityReason,
        actorUserId: params.actorUserId,
        correlationId: params.correlationId,
    });

    return diagnostic;
}
