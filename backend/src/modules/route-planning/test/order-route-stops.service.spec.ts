import { OrderRouteStopsService } from '../application/order-route-stops.service';
import { InvalidStopOrderingInputError } from '../domain/models/invalid-stop-ordering-input.error';
import type { CapacityClusterProposal } from '../domain/models/clustering.types';
import type {
  OrderedRouteSequence,
  StopCandidateInput,
  StopOrderingOptions,
} from '../domain/models/stop-ordering.types';
import type { StopOrderingAlgorithm } from '../domain/algorithms/stop-ordering-algorithm';
import {
  ALT_TENANT_ID,
  COLLINEAR_CANDIDATES,
  DEFAULT_TENANT_ID,
  createStopCandidate,
  createStopOrderingOptions,
} from './fixtures/stop-ordering.fixtures';

describe('OrderRouteStopsService (CA-09, CA-10)', () => {
  let mockAlgorithm: jest.Mocked<StopOrderingAlgorithm>;
  let service: OrderRouteStopsService;

  const validProposal: CapacityClusterProposal = {
    proposalId: 'prop-1',
    clusterId: 'cluster-1',
    candidateVehicleId: 'veh-1',
    packageIds: ['pkg-1', 'pkg-2', 'pkg-3'],
    totalWeightKg: '3.000',
    totalVolumeM3: '0.006000',
  };

  const dummyResult: OrderedRouteSequence = {
    tenantId: DEFAULT_TENANT_ID,
    origin: COLLINEAR_CANDIDATES[0].coordinates,
    algorithm: 'nearest-neighbor',
    algorithmVersion: '1',
    stops: [],
    distanceToLastStopMeters: 0,
    returnToOriginMeters: 0,
    totalDistanceMeters: 0,
    refinement: null,
  };

  beforeEach(() => {
    mockAlgorithm = {
      name: 'nearest-neighbor',
      version: '1',
      order: jest.fn().mockReturnValue(dummyResult),
    };
    service = new OrderRouteStopsService(mockAlgorithm);
  });

  describe('tenant verification and cross-tenant isolation (CA-09)', () => {
    it('rejects execution when source proposal tenantId differs from options tenantId', () => {
      // Arrange
      const options = createStopOrderingOptions({ tenantId: DEFAULT_TENANT_ID });
      const source = { tenantId: ALT_TENANT_ID, proposal: validProposal };

      // Act & Assert
      expect(() =>
        service.execute(options, source, COLLINEAR_CANDIDATES),
      ).toThrow(InvalidStopOrderingInputError);
      try {
        service.execute(options, source, COLLINEAR_CANDIDATES);
      } catch (err: any) {
        expect(err.reason).toBe('TENANT_MISMATCH');
      }
      expect(mockAlgorithm.order).not.toHaveBeenCalled();
    });

    it('rejects execution when any candidate belongs to a different tenant', () => {
      // Arrange
      const options = createStopOrderingOptions({ tenantId: DEFAULT_TENANT_ID });
      const source = { tenantId: DEFAULT_TENANT_ID, proposal: validProposal };
      const mixedCandidates: StopCandidateInput[] = [
        createStopCandidate('pkg-1', 0, 0.01, DEFAULT_TENANT_ID),
        createStopCandidate('pkg-2', 0, 0.02, ALT_TENANT_ID),
        createStopCandidate('pkg-3', 0, 0.03, DEFAULT_TENANT_ID),
      ];

      // Act & Assert
      expect(() =>
        service.execute(options, source, mixedCandidates),
      ).toThrow(InvalidStopOrderingInputError);
      try {
        service.execute(options, source, mixedCandidates);
      } catch (err: any) {
        expect(err.reason).toBe('TENANT_MISMATCH');
      }
      expect(mockAlgorithm.order).not.toHaveBeenCalled();
    });
  });

  describe('proposal membership and consistency validation (CA-09)', () => {
    it('rejects execution when proposal is null or has no packageIds', () => {
      // Arrange
      const options = createStopOrderingOptions();
      const malformedSource = {
        tenantId: DEFAULT_TENANT_ID,
        proposal: { ...validProposal, packageIds: [] },
      };

      // Act & Assert
      expect(() =>
        service.execute(options, malformedSource, COLLINEAR_CANDIDATES),
      ).toThrow(InvalidStopOrderingInputError);
      try {
        service.execute(options, malformedSource, COLLINEAR_CANDIDATES);
      } catch (err: any) {
        expect(err.reason).toBe('INVALID_PROPOSAL');
      }
      expect(mockAlgorithm.order).not.toHaveBeenCalled();
    });

    it('rejects execution when candidates has missing packages compared to proposal', () => {
      // Arrange: proposal has pkg-1, pkg-2, pkg-3; candidates only has pkg-1, pkg-2
      const options = createStopOrderingOptions();
      const source = { tenantId: DEFAULT_TENANT_ID, proposal: validProposal };
      const missingCandidates = [
        createStopCandidate('pkg-1', 0, 0.01),
        createStopCandidate('pkg-2', 0, 0.02),
      ];

      // Act & Assert
      expect(() =>
        service.execute(options, source, missingCandidates),
      ).toThrow(InvalidStopOrderingInputError);
      try {
        service.execute(options, source, missingCandidates);
      } catch (err: any) {
        expect(err.reason).toBe('PROPOSAL_PACKAGE_MISMATCH');
      }
      expect(mockAlgorithm.order).not.toHaveBeenCalled();
    });

    it('rejects execution when candidates has extra packages not in proposal', () => {
      // Arrange: candidates has extra pkg-4
      const options = createStopOrderingOptions();
      const source = { tenantId: DEFAULT_TENANT_ID, proposal: validProposal };
      const extraCandidates = [
        ...COLLINEAR_CANDIDATES,
        createStopCandidate('pkg-extra', 0, 0.04),
      ];

      // Act & Assert
      expect(() =>
        service.execute(options, source, extraCandidates),
      ).toThrow(InvalidStopOrderingInputError);
      try {
        service.execute(options, source, extraCandidates);
      } catch (err: any) {
        expect(err.reason).toBe('PROPOSAL_PACKAGE_MISMATCH');
      }
      expect(mockAlgorithm.order).not.toHaveBeenCalled();
    });
  });

  describe('delegation to strategy', () => {
    it('delegates to algorithm.order exactly once with options and candidates', () => {
      // Arrange
      const options = createStopOrderingOptions();
      const source = { tenantId: DEFAULT_TENANT_ID, proposal: validProposal };

      // Act
      const result = service.execute(options, source, COLLINEAR_CANDIDATES);

      // Assert
      expect(mockAlgorithm.order).toHaveBeenCalledTimes(1);
      expect(mockAlgorithm.order).toHaveBeenCalledWith(COLLINEAR_CANDIDATES, options);
      expect(result).toBe(dummyResult);
    });
  });
});
