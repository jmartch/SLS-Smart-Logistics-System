import { InvalidNetworkAttachmentPolicyError } from '../domain/invalid-network-attachment-policy.error';
import { NetworkAttachmentPolicy } from '../domain/network-attachment.policy';
import type {
  NetworkAttachmentPolicyConfig,
  RoadNodeCandidate,
} from '../domain/network-attachment.types';

function createPolicyConfig(
  overrides?: Partial<NetworkAttachmentPolicyConfig>,
): NetworkAttachmentPolicyConfig {
  return {
    maxAcceptanceRadiusMeters: 50,
    maxReviewRadiusMeters: 150,
    ...overrides,
  };
}

function createNodeCandidate(
  nodeId: string,
  latitude: number,
  longitude: number,
  datasetId: string = '11111111-1111-4111-8111-111111111111',
  traversableProfiles: readonly (
    'MOTOR_VEHICLE' | 'MOTORCYCLE' | 'BICYCLE' | 'FOOT'
  )[] = ['MOTOR_VEHICLE', 'MOTORCYCLE'],
): RoadNodeCandidate {
  return {
    nodeId,
    datasetId,
    latitude,
    longitude,
    traversableProfiles,
  };
}

describe('NetworkAttachmentPolicy', () => {
  const expectedDatasetId = '11111111-1111-4111-8111-111111111111';

  describe('validateConfig', () => {
    it('accepts valid acceptance and review radii', () => {
      const config = createPolicyConfig();

      expect(() =>
        NetworkAttachmentPolicy.validateConfig(config),
      ).not.toThrow();
    });

    it('rejects non-positive acceptance radius', () => {
      const config = createPolicyConfig({ maxAcceptanceRadiusMeters: 0 });

      expect(() => NetworkAttachmentPolicy.validateConfig(config)).toThrow(
        InvalidNetworkAttachmentPolicyError,
      );
    });

    it('rejects non-finite acceptance radius', () => {
      const config = createPolicyConfig({
        maxAcceptanceRadiusMeters: Number.POSITIVE_INFINITY,
      });

      expect(() => NetworkAttachmentPolicy.validateConfig(config)).toThrow(
        InvalidNetworkAttachmentPolicyError,
      );
    });

    it('rejects review radius smaller than acceptance radius', () => {
      const config = createPolicyConfig({
        maxAcceptanceRadiusMeters: 100,
        maxReviewRadiusMeters: 50,
      });

      expect(() => NetworkAttachmentPolicy.validateConfig(config)).toThrow(
        InvalidNetworkAttachmentPolicyError,
      );
    });
  });

  describe('evaluate', () => {
    const targetLatitude = 10.9878;
    const targetLongitude = -74.7889;

    it('rejects empty expectedDatasetId', () => {
      const config = createPolicyConfig();

      expect(() =>
        NetworkAttachmentPolicy.evaluate({
          expectedDatasetId: '   ',
          profile: 'MOTOR_VEHICLE',
          targetLatitude,
          targetLongitude,
          candidateNodes: [],
          config,
        }),
      ).toThrow(InvalidNetworkAttachmentPolicyError);
    });

    it('returns REVIEW_REQUIRED when candidate nodes list is empty', () => {
      const config = createPolicyConfig();

      const decision = NetworkAttachmentPolicy.evaluate({
        expectedDatasetId,
        profile: 'MOTOR_VEHICLE',
        targetLatitude,
        targetLongitude,
        candidateNodes: [],
        config,
      });

      expect(decision.status).toBe('REVIEW_REQUIRED');
      expect(decision.selectedNodeId).toBeNull();
      expect(decision.snappedLocation).toBeNull();
      expect(decision.accessDistanceMeters).toBeNull();
      expect(decision.reasonCode).toBe('NO_ROAD_NODES_FOUND');
      expect(decision.directedReachabilityVerified).toBe(false);
    });

    it('discards candidate nodes from incompatible datasets', () => {
      const config = createPolicyConfig();
      const foreignCandidate = createNodeCandidate(
        'node-foreign',
        10.98785,
        -74.78895,
        '99999999-9999-4999-8999-999999999999',
      );

      const decision = NetworkAttachmentPolicy.evaluate({
        expectedDatasetId,
        profile: 'MOTOR_VEHICLE',
        targetLatitude,
        targetLongitude,
        candidateNodes: [foreignCandidate],
        config,
      });

      expect(decision.status).toBe('REVIEW_REQUIRED');
      expect(decision.selectedNodeId).toBeNull();
      expect(decision.reasonCode).toBe('NO_ROAD_NODES_FOUND');
    });

    it('auto-accepts nearest node within acceptance radius', () => {
      const config = createPolicyConfig({ maxAcceptanceRadiusMeters: 100 });
      const candidate = createNodeCandidate(
        'node-near',
        10.98785,
        -74.78895,
        expectedDatasetId,
      );

      const decision = NetworkAttachmentPolicy.evaluate({
        expectedDatasetId,
        profile: 'MOTOR_VEHICLE',
        targetLatitude,
        targetLongitude,
        candidateNodes: [candidate],
        config,
      });

      expect(decision.status).toBe('AUTO_ACCEPTED');
      expect(decision.selectedNodeId).toBe('node-near');
      expect(decision.snappedLocation).toEqual({
        latitude: candidate.latitude,
        longitude: candidate.longitude,
      });
      expect(decision.accessDistanceMeters).toBeGreaterThan(0);
      expect(decision.accessDistanceMeters).toBeLessThanOrEqual(100);
      expect(decision.reasonCode).toBeNull();
      expect(decision.directedReachabilityVerified).toBe(false);
    });

    it('resolves ties by choosing the node with lower lexicographical id', () => {
      const config = createPolicyConfig({ maxAcceptanceRadiusMeters: 100 });
      const nodeA = createNodeCandidate(
        'node-a',
        10.98785,
        -74.78895,
        expectedDatasetId,
      );
      const nodeB = createNodeCandidate(
        'node-b',
        10.98785,
        -74.78895,
        expectedDatasetId,
      );

      const decision = NetworkAttachmentPolicy.evaluate({
        expectedDatasetId,
        profile: 'MOTOR_VEHICLE',
        targetLatitude,
        targetLongitude,
        candidateNodes: [nodeB, nodeA],
        config,
      });

      expect(decision.selectedNodeId).toBe('node-a');
    });

    it('requires review when distance exceeds acceptance radius but is within review radius', () => {
      const config = createPolicyConfig({
        maxAcceptanceRadiusMeters: 10,
        maxReviewRadiusMeters: 500,
      });
      const candidate = createNodeCandidate(
        'node-mid',
        10.989,
        -74.79,
        expectedDatasetId,
      );

      const decision = NetworkAttachmentPolicy.evaluate({
        expectedDatasetId,
        profile: 'MOTOR_VEHICLE',
        targetLatitude,
        targetLongitude,
        candidateNodes: [candidate],
        config,
      });

      expect(decision.status).toBe('REVIEW_REQUIRED');
      expect(decision.selectedNodeId).toBe('node-mid');
      expect(decision.reasonCode).toBe(
        'ACCESS_DISTANCE_EXCEEDS_ACCEPTANCE_RADIUS',
      );
      expect(decision.directedReachabilityVerified).toBe(false);
    });

    it('rejects candidate when candidate lacks requested traversable profile', () => {
      const config = createPolicyConfig();
      const candidateFootOnly = createNodeCandidate(
        'node-foot',
        targetLatitude,
        targetLongitude,
        expectedDatasetId,
        ['FOOT'],
      );

      const decision = NetworkAttachmentPolicy.evaluate({
        expectedDatasetId,
        profile: 'MOTOR_VEHICLE',
        targetLatitude,
        targetLongitude,
        candidateNodes: [candidateFootOnly],
        config,
      });

      expect(decision.status).toBe('REVIEW_REQUIRED');
      expect(decision.selectedNodeId).toBeNull();
      expect(decision.reasonCode).toBe('NO_ROAD_NODES_FOUND');
    });

    it('rejects candidate when traversableProfiles is missing at runtime (fail closed)', () => {
      const config = createPolicyConfig();
      const candidateWithoutProfiles = {
        nodeId: 'node-missing-profiles',
        datasetId: expectedDatasetId,
        latitude: targetLatitude,
        longitude: targetLongitude,
      } as unknown as RoadNodeCandidate;

      const decision = NetworkAttachmentPolicy.evaluate({
        expectedDatasetId,
        profile: 'MOTOR_VEHICLE',
        targetLatitude,
        targetLongitude,
        candidateNodes: [candidateWithoutProfiles],
        config,
      });

      expect(decision.status).toBe('REVIEW_REQUIRED');
      expect(decision.selectedNodeId).toBeNull();
      expect(decision.reasonCode).toBe('NO_ROAD_NODES_FOUND');
    });

    it('rejects candidate when traversableProfiles is an empty array (fail closed)', () => {
      const config = createPolicyConfig();
      const candidateEmptyProfiles: RoadNodeCandidate = {
        nodeId: 'node-empty-profiles',
        datasetId: expectedDatasetId,
        latitude: targetLatitude,
        longitude: targetLongitude,
        traversableProfiles: [],
      };

      const decision = NetworkAttachmentPolicy.evaluate({
        expectedDatasetId,
        profile: 'MOTOR_VEHICLE',
        targetLatitude,
        targetLongitude,
        candidateNodes: [candidateEmptyProfiles],
        config,
      });

      expect(decision.status).toBe('REVIEW_REQUIRED');
      expect(decision.selectedNodeId).toBeNull();
      expect(decision.reasonCode).toBe('NO_ROAD_NODES_FOUND');
    });

    it('accepts candidate when candidate includes requested traversable profile', () => {
      const config = createPolicyConfig();
      const candidateMotor = createNodeCandidate(
        'node-motor',
        targetLatitude,
        targetLongitude,
        expectedDatasetId,
        ['MOTOR_VEHICLE', 'MOTORCYCLE'],
      );

      const decision = NetworkAttachmentPolicy.evaluate({
        expectedDatasetId,
        profile: 'MOTOR_VEHICLE',
        targetLatitude,
        targetLongitude,
        candidateNodes: [candidateMotor],
        config,
      });

      expect(decision.status).toBe('AUTO_ACCEPTED');
      expect(decision.selectedNodeId).toBe('node-motor');
    });

    it('returns NO_ROAD_NODES_WITHIN_RADIUS when nearest candidate exceeds maxReviewRadiusMeters', () => {
      const config = createPolicyConfig({
        maxAcceptanceRadiusMeters: 10,
        maxReviewRadiusMeters: 20,
      });
      const candidate = createNodeCandidate(
        'node-far',
        10.999,
        -74.8,
        expectedDatasetId,
      );

      const decision = NetworkAttachmentPolicy.evaluate({
        expectedDatasetId,
        profile: 'MOTOR_VEHICLE',
        targetLatitude,
        targetLongitude,
        candidateNodes: [candidate],
        config,
      });

      expect(decision.status).toBe('REVIEW_REQUIRED');
      expect(decision.selectedNodeId).toBeNull();
      expect(decision.snappedLocation).toBeNull();
      expect(decision.accessDistanceMeters).toBeNull();
      expect(decision.reasonCode).toBe('NO_ROAD_NODES_WITHIN_RADIUS');
    });
  });
});
