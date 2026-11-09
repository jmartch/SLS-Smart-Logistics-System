import { Coordinates } from '../../route-planning/domain/coordinates';
import { InvalidNetworkAttachmentPolicyError } from './invalid-network-attachment-policy.error';
import type {
  NetworkAttachmentDecision,
  NetworkAttachmentEvaluationInput,
  NetworkAttachmentPolicyConfig,
  RoadNodeCandidate,
} from './network-attachment.types';

interface ScoredRoadNodeCandidate {
  readonly candidate: RoadNodeCandidate;
  readonly distanceMeters: number;
}

export class NetworkAttachmentPolicy {
  static validateConfig(config: NetworkAttachmentPolicyConfig): void {
    if (
      typeof config.maxAcceptanceRadiusMeters !== 'number' ||
      !Number.isFinite(config.maxAcceptanceRadiusMeters) ||
      config.maxAcceptanceRadiusMeters <= 0
    ) {
      throw new InvalidNetworkAttachmentPolicyError(
        'maxAcceptanceRadiusMeters must be a positive finite number',
        'maxAcceptanceRadiusMeters',
      );
    }

    if (config.maxReviewRadiusMeters !== undefined) {
      if (
        typeof config.maxReviewRadiusMeters !== 'number' ||
        !Number.isFinite(config.maxReviewRadiusMeters) ||
        config.maxReviewRadiusMeters < config.maxAcceptanceRadiusMeters
      ) {
        throw new InvalidNetworkAttachmentPolicyError(
          'maxReviewRadiusMeters must be greater than or equal to maxAcceptanceRadiusMeters',
          'maxReviewRadiusMeters',
        );
      }
    }
  }

  static evaluate(
    input: NetworkAttachmentEvaluationInput,
  ): NetworkAttachmentDecision {
    this.validateConfig(input.config);

    if (
      !input.expectedDatasetId ||
      input.expectedDatasetId.trim().length === 0
    ) {
      throw new InvalidNetworkAttachmentPolicyError(
        'expectedDatasetId is required for network attachment evaluation',
        'expectedDatasetId',
      );
    }

    const targetCoords = Coordinates.create(
      input.targetLatitude,
      input.targetLongitude,
    );

    const compatibleNodes = input.candidateNodes.filter(
      (candidate) =>
        candidate.datasetId === input.expectedDatasetId &&
        Array.isArray(candidate.traversableProfiles) &&
        candidate.traversableProfiles.length > 0 &&
        candidate.traversableProfiles.includes(input.profile),
    );

    if (compatibleNodes.length === 0) {
      return {
        status: 'REVIEW_REQUIRED',
        selectedNodeId: null,
        snappedLocation: null,
        accessDistanceMeters: null,
        reasonCode: 'NO_ROAD_NODES_FOUND',
        directedReachabilityVerified: false,
      };
    }

    const scoredCandidates: ScoredRoadNodeCandidate[] = compatibleNodes.map(
      (candidate) => {
        const nodeCoords = Coordinates.create(
          candidate.latitude,
          candidate.longitude,
        );
        return {
          candidate,
          distanceMeters: targetCoords.distanceTo(nodeCoords),
        };
      },
    );

    scoredCandidates.sort((a, b) => {
      if (a.distanceMeters !== b.distanceMeters) {
        return a.distanceMeters < b.distanceMeters ? -1 : 1;
      }
      if (a.candidate.nodeId === b.candidate.nodeId) {
        return 0;
      }
      return a.candidate.nodeId < b.candidate.nodeId ? -1 : 1;
    });

    const nearest = scoredCandidates[0];
    const effectiveMaxRadius =
      input.config.maxReviewRadiusMeters ??
      input.config.maxAcceptanceRadiusMeters;

    if (nearest.distanceMeters > effectiveMaxRadius) {
      return {
        status: 'REVIEW_REQUIRED',
        selectedNodeId: null,
        snappedLocation: null,
        accessDistanceMeters: null,
        reasonCode: 'NO_ROAD_NODES_WITHIN_RADIUS',
        directedReachabilityVerified: false,
      };
    }

    const snappedLocation = {
      latitude: nearest.candidate.latitude,
      longitude: nearest.candidate.longitude,
    };

    if (nearest.distanceMeters <= input.config.maxAcceptanceRadiusMeters) {
      return {
        status: 'AUTO_ACCEPTED',
        selectedNodeId: nearest.candidate.nodeId,
        snappedLocation,
        accessDistanceMeters: nearest.distanceMeters,
        reasonCode: null,
        directedReachabilityVerified: false,
      };
    }

    return {
      status: 'REVIEW_REQUIRED',
      selectedNodeId: nearest.candidate.nodeId,
      snappedLocation,
      accessDistanceMeters: nearest.distanceMeters,
      reasonCode: 'ACCESS_DISTANCE_EXCEEDS_ACCEPTANCE_RADIUS',
      directedReachabilityVerified: false,
    };
  }
}
