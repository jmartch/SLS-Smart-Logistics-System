export interface GeocodingDiagnosticAuditEntry {
    readonly tenantId: string;
    readonly packageId: string;
    readonly addressId: string;
    readonly attemptId: string | null;
    readonly selectedCandidateId: string | null;
    readonly attachmentId: string | null;
    readonly attachmentStatus: string | null;
    readonly datasetId: string | null;
    readonly profile: string | null;
    readonly status: string;
    readonly eligibility: string;
    readonly reason: string | null;
    readonly actorUserId: string;
    readonly correlationId?: string;
}

export interface AddressCorrectionAuditEntry {
    readonly tenantId: string;
    readonly packageId: string;
    readonly previousAddressId: string;
    readonly newAddressId: string;
    readonly reason: string;
    readonly actorUserId: string;
    readonly correlationId?: string;
}

export interface GeocodingReviewAuditEntry {
    readonly tenantId: string;
    readonly packageId: string;
    readonly attemptId: string;
    readonly candidateId: string;
    readonly decision: string;
    readonly reason: string;
    readonly reviewerUserId: string;
    readonly correlationId?: string;
}

export interface PackageGeocodingAuditPort {
    recordDiagnostic(entry: GeocodingDiagnosticAuditEntry): Promise<void>;

    recordAddressCorrection(entry: AddressCorrectionAuditEntry): Promise<void>;

    recordReview(entry: GeocodingReviewAuditEntry): Promise<void>;
}
