export type RoadProfile = 'MOTOR_VEHICLE' | 'MOTORCYCLE' | 'BICYCLE' | 'FOOT';

export type NetworkAttachmentStatus =
  'AUTO_ACCEPTED' | 'REVIEW_REQUIRED' | 'APPROVED' | 'REJECTED';

export interface RoadNodeCandidate {
  readonly nodeId: string;
  readonly datasetId: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly traversableProfiles: readonly RoadProfile[];
}

export interface NetworkAttachmentPolicyConfig {
  readonly maxAcceptanceRadiusMeters: number;
  readonly maxReviewRadiusMeters?: number;
}

export interface NetworkAttachmentEvaluationInput {
  readonly expectedDatasetId: string;
  readonly profile: RoadProfile;
  readonly targetLatitude: number;
  readonly targetLongitude: number;
  readonly candidateNodes: readonly RoadNodeCandidate[];
  readonly config: NetworkAttachmentPolicyConfig;
}

export interface NetworkAttachmentDecision {
  readonly status: NetworkAttachmentStatus;
  readonly selectedNodeId: string | null;
  readonly snappedLocation: {
    readonly latitude: number;
    readonly longitude: number;
  } | null;
  readonly accessDistanceMeters: number | null;
  readonly reasonCode: string | null;
  readonly directedReachabilityVerified: boolean;
}
