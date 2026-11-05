import { Coordinates } from '../domain/coordinates';
import { NearestNeighborOrdering } from '../domain/algorithms/nearest-neighbor-ordering';
import {
  InvalidStopOrderingInputError,
  type InvalidStopOrderingInputReason,
} from '../domain/models/invalid-stop-ordering-input.error';
import type {
  StopCandidateInput,
  StopOrderingOptions,
} from '../domain/models/stop-ordering.types';
import {
  ALT_TENANT_ID,
  DEFAULT_TENANT_ID,
  FIXED_ORIGIN,
  createStopCandidate,
  createStopOrderingOptions,
} from './fixtures/stop-ordering.fixtures';

describe('Stop Ordering Input Validation (CA-08)', () => {
  let algorithm: NearestNeighborOrdering;

  beforeEach(() => {
    algorithm = new NearestNeighborOrdering();
  });

  function expectValidationError(
    candidates: readonly StopCandidateInput[],
    options: StopOrderingOptions,
    expectedReason: InvalidStopOrderingInputReason,
  ): void {
    let thrownError: unknown;
    try {
      algorithm.order(candidates, options);
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(InvalidStopOrderingInputError);
    expect((thrownError as InvalidStopOrderingInputError).reason).toBe(
      expectedReason,
    );
  }

  describe('tenantId validation and isolation', () => {
    it('rejects empty or whitespace-only tenantId in options', () => {
      // Arrange
      const candidates = [createStopCandidate('pkg-1', 0, 0.01)];
      const emptyTenantOptions = createStopOrderingOptions({ tenantId: '' });
      const blankTenantOptions = createStopOrderingOptions({ tenantId: '   ' });

      // Act & Assert
      expectValidationError(candidates, emptyTenantOptions, 'INVALID_TENANT_ID');
      expectValidationError(candidates, blankTenantOptions, 'INVALID_TENANT_ID');
    });

    it('rejects candidate with a mismatched tenantId', () => {
      // Arrange
      const options = createStopOrderingOptions({ tenantId: DEFAULT_TENANT_ID });
      const candidates = [
        createStopCandidate('pkg-1', 0, 0.01, DEFAULT_TENANT_ID),
        createStopCandidate('pkg-2', 0, 0.02, ALT_TENANT_ID),
      ];

      // Act & Assert
      expectValidationError(candidates, options, 'TENANT_MISMATCH');
    });

    it('prioritizes TENANT_MISMATCH before checking packageId validity', () => {
      // Arrange: Candidate has both mismatched tenant and invalid blank packageId
      const options = createStopOrderingOptions({ tenantId: DEFAULT_TENANT_ID });
      const candidateWithBothErrors = [
        createStopCandidate('   ', 0, 0.01, ALT_TENANT_ID),
      ];

      // Act & Assert: Deterministic error precedence requires TENANT_MISMATCH first
      expectValidationError(candidateWithBothErrors, options, 'TENANT_MISMATCH');
    });
  });

  describe('candidates collection structure', () => {
    it('rejects input when candidates is not an array', () => {
      // Arrange
      const options = createStopOrderingOptions();
      const nonArrayCandidates = null as unknown as readonly StopCandidateInput[];

      // Act & Assert
      expectValidationError(nonArrayCandidates, options, 'INVALID_CANDIDATES');
    });

    it('rejects input when candidates contains null or non-object items', () => {
      // Arrange
      const options = createStopOrderingOptions();
      const malformedCandidates = [null] as unknown as readonly StopCandidateInput[];

      // Act & Assert
      expectValidationError(malformedCandidates, options, 'INVALID_CANDIDATES');
    });
  });

  describe('packageId validation', () => {
    it('rejects candidate with empty or whitespace-only packageId', () => {
      // Arrange
      const options = createStopOrderingOptions();
      const candidatesWithEmptyId = [createStopCandidate('', 0, 0.01)];
      const candidatesWithBlankId = [createStopCandidate('   ', 0, 0.01)];

      // Act & Assert
      expectValidationError(candidatesWithEmptyId, options, 'INVALID_PACKAGE_ID');
      expectValidationError(candidatesWithBlankId, options, 'INVALID_PACKAGE_ID');
    });

    it('rejects candidates containing duplicate package IDs', () => {
      // Arrange
      const options = createStopOrderingOptions();
      const duplicateCandidates = [
        createStopCandidate('pkg-same', 0, 0.01),
        createStopCandidate('pkg-same', 0, 0.02),
      ];

      // Act & Assert
      expectValidationError(duplicateCandidates, options, 'DUPLICATE_PACKAGE_ID');
    });
  });

  describe('origin coordinates validation', () => {
    it('rejects options with null or malformed origin coordinates', () => {
      // Arrange
      const candidates = [createStopCandidate('pkg-1', 0, 0.01)];
      const nullOriginOptions = {
        tenantId: DEFAULT_TENANT_ID,
        origin: null as unknown as Coordinates,
      };

      // Act & Assert
      expectValidationError(candidates, nullOriginOptions, 'INVALID_ORIGIN');
    });
  });

  describe('stop coordinates validation', () => {
    it('rejects candidate with missing coordinates', () => {
      // Arrange
      const options = createStopOrderingOptions();
      const missingCoordCandidate = [
        {
          packageId: 'pkg-1',
          tenantId: DEFAULT_TENANT_ID,
          coordinates: undefined as unknown as Coordinates,
        },
      ];

      // Act & Assert
      expectValidationError(
        missingCoordCandidate,
        options,
        'MISSING_STOP_COORDINATES',
      );
    });

    it('rejects candidate with malformed coordinates values', () => {
      // Arrange
      const options = createStopOrderingOptions();
      const malformedCoordCandidate = [
        {
          packageId: 'pkg-1',
          tenantId: DEFAULT_TENANT_ID,
          coordinates: { latitude: 999, longitude: 0 } as unknown as Coordinates,
        },
      ];

      // Act & Assert
      expectValidationError(
        malformedCoordCandidate,
        options,
        'INVALID_STOP_COORDINATES',
      );
    });
  });

  describe('twoOpt options validation (when provided)', () => {
    it('rejects negative, float or out-of-range maxIterations', () => {
      // Arrange
      const candidates = [createStopCandidate('pkg-1', 0, 0.01)];
      const negativeIter = createStopOrderingOptions({
        twoOpt: { maxIterations: -1, minImprovementMeters: 0.001 },
      });
      const floatIter = createStopOrderingOptions({
        twoOpt: { maxIterations: 10.5, minImprovementMeters: 0.001 },
      });
      const exceedIter = createStopOrderingOptions({
        twoOpt: { maxIterations: 1001, minImprovementMeters: 0.001 },
      });

      // Act & Assert
      expectValidationError(candidates, negativeIter, 'INVALID_MAX_ITERATIONS');
      expectValidationError(candidates, floatIter, 'INVALID_MAX_ITERATIONS');
      expectValidationError(candidates, exceedIter, 'INVALID_MAX_ITERATIONS');
    });

    it('rejects negative or NaN minImprovementMeters', () => {
      // Arrange
      const candidates = [createStopCandidate('pkg-1', 0, 0.01)];
      const negativeImprovement = createStopOrderingOptions({
        twoOpt: { maxIterations: 100, minImprovementMeters: -0.1 },
      });
      const nanImprovement = createStopOrderingOptions({
        twoOpt: { maxIterations: 100, minImprovementMeters: Number.NaN },
      });

      // Act & Assert
      expectValidationError(
        candidates,
        negativeImprovement,
        'INVALID_MIN_IMPROVEMENT',
      );
      expectValidationError(
        candidates,
        nanImprovement,
        'INVALID_MIN_IMPROVEMENT',
      );
    });
  });
});
