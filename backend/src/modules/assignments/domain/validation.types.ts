export interface AssignmentValidationContext {
    readonly tenantId: string;
    readonly hasDuplicateAssignment: boolean;
    readonly planning: {
        readonly datasetId: string;
        readonly profile: 'MOTOR_VEHICLE' | 'MOTORCYCLE' | 'BICYCLE' | 'FOOT';
    };
    readonly geocoding: {
        readonly tenantId: string;
        readonly addressId: string;
        readonly datasetId: string;
        readonly datasetStatus: 'STAGING' | 'READY' | 'FAILED';
        readonly status: 'MATCHED' | 'REVIEW_REQUIRED' | 'NOT_FOUND';
        readonly selectedCandidateId: string | null;
        // Coordinates projected from the selected candidate, not from Package.
        readonly latitude: number | null;
        readonly longitude: number | null;
    } | null;
    readonly networkAttachment: {
        readonly tenantId: string;
        readonly datasetId: string;
        readonly geocodingCandidateId: string;
        readonly profile: AssignmentValidationContext['planning']['profile'];
        readonly status:
            'AUTO_ACCEPTED' | 'REVIEW_REQUIRED' | 'APPROVED' | 'REJECTED';
        readonly roadNodeId: string | null;
        readonly roadEdgeId: string | null;
    } | null;

    readonly package: {
        readonly id: string;
        readonly tenantId: string;
        readonly recipientAddress: string;
        readonly addressId: string;
        readonly zoneId: string | null;
        readonly weightKg: number;
        readonly volumeM3: number;
    };

    readonly vehicle: {
        readonly id: string;
        readonly tenantId: string;
        readonly available: boolean;
        readonly remainingWeightKg: number;
        readonly remainingVolumeM3: number;
    } | null;

    readonly courier: {
        readonly id: string;
        readonly tenantId: string;
        readonly available: boolean;
    } | null;
}

export type AssignmentRejectionCode =
    | 'TENANT_MISMATCH'
    | 'DUPLICATE_ASSIGNMENT'
    | 'INCOMPLETE_DATA'
    | 'INVALID_COORDINATES'
    | 'GEOCODING_NOT_READY'
    | 'NETWORK_ATTACHMENT_NOT_READY'
    | 'ZONE_NOT_SUPPORTED'
    | 'VEHICLE_UNAVAILABLE'
    | 'WEIGHT_CAPACITY_EXCEEDED'
    | 'VOLUME_CAPACITY_EXCEEDED'
    | 'COURIER_UNAVAILABLE';

export type AssignmentValidationResult =
    | {
          readonly ok: true;
      }
    | {
          readonly ok: false;
          readonly code: AssignmentRejectionCode;
          readonly message: string;
          readonly handler: string;
      };
