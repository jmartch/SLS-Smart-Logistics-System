import type {
  NetworkAttachmentStatus,
  RoadNodeCandidate,
  RoadProfile,
} from '../../domain/network-attachment.types';

export interface FindCandidateRoadNodesQuery {
  readonly datasetId: string;
  readonly profile: RoadProfile;
  readonly latitude: number;
  readonly longitude: number;
  readonly searchRadiusMeters?: number;
  readonly limit?: number;
}

export interface SaveNetworkAttachmentCommand {
  readonly tenantId: string;
  readonly datasetId: string;
  readonly geocodingCandidateId: string;
  readonly profile: RoadProfile;
  readonly roadNodeId: string | null;
  readonly roadEdgeId?: string | null;
  readonly snappedLatitude: number;
  readonly snappedLongitude: number;
  readonly accessDistanceMeters: number;
  readonly status: NetworkAttachmentStatus;
  readonly reviewedByUserId?: string | null;
  readonly reviewReason?: string | null;
  readonly reviewedAt?: Date | null;
}

export interface SavedNetworkAttachmentRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly datasetId: string;
  readonly geocodingCandidateId: string;
  readonly profile: RoadProfile;
  readonly roadNodeId: string | null;
  readonly roadEdgeId: string | null;
  readonly status: NetworkAttachmentStatus;
  readonly accessDistanceMeters: number;
}

export interface NetworkAttachmentPort {
  findCandidateNodes(
    query: FindCandidateRoadNodesQuery,
  ): Promise<readonly RoadNodeCandidate[]>;

  saveAttachment(
    command: SaveNetworkAttachmentCommand,
  ): Promise<SavedNetworkAttachmentRecord>;

  findByCandidateAndProfile(query: {
    readonly tenantId: string;
    readonly geocodingCandidateId: string;
    readonly datasetId: string;
    readonly profile: RoadProfile;
  }): Promise<SavedNetworkAttachmentRecord | null>;
}
