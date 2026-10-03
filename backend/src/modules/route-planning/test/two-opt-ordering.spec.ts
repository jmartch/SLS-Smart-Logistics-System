import { TwoOptOrdering } from '../domain/algorithms/two-opt-ordering';
import { NearestNeighborOrdering } from '../domain/algorithms/nearest-neighbor-ordering';
import {
  COLLINEAR_CANDIDATES,
  CROSSING_CIRCUIT_CANDIDATES,
  EMPTY_CANDIDATES,
  SINGLE_CANDIDATE,
  TWO_CANDIDATES,
  createStopOrderingOptions,
} from './fixtures/stop-ordering.fixtures';

describe('TwoOptOrdering', () => {
  let algorithm: TwoOptOrdering;
  let baseNN: NearestNeighborOrdering;

  beforeEach(() => {
    algorithm = new TwoOptOrdering();
    baseNN = new NearestNeighborOrdering();
  });

  describe('metadata and contract', () => {
    it('declares the algorithm name and version 1', () => {
      expect(algorithm.name).toBe('nearest-neighbor-two-opt');
      expect(algorithm.version).toBe('1');
    });
  });

  describe('trivial routes (CA-03, CA-07)', () => {
    it('returns TRIVIAL_ROUTE with zero iterations for empty candidates', () => {
      // Arrange
      const options = createStopOrderingOptions();

      // Act
      const result = algorithm.order(EMPTY_CANDIDATES, options);

      // Assert
      expect(result.stops).toHaveLength(0);
      expect(result.refinement).not.toBeNull();
      expect(result.refinement?.terminationReason).toBe('TRIVIAL_ROUTE');
      expect(result.refinement?.iterations).toBe(0);
      expect(result.refinement?.acceptedSwaps).toBe(0);
      expect(result.refinement?.improvementMeters).toBe(0);
    });

    it('returns TRIVIAL_ROUTE for a single candidate', () => {
      // Arrange
      const options = createStopOrderingOptions();

      // Act
      const result = algorithm.order(SINGLE_CANDIDATE, options);

      // Assert
      expect(result.stops).toHaveLength(1);
      expect(result.refinement?.terminationReason).toBe('TRIVIAL_ROUTE');
      expect(result.refinement?.iterations).toBe(0);
      expect(result.refinement?.acceptedSwaps).toBe(0);
    });

    it('returns TRIVIAL_ROUTE for two candidates without performing 2-opt inversion', () => {
      // Arrange
      const options = createStopOrderingOptions();

      // Act
      const result = algorithm.order(TWO_CANDIDATES, options);

      // Assert
      expect(result.stops).toHaveLength(2);
      expect(result.refinement?.terminationReason).toBe('TRIVIAL_ROUTE');
      expect(result.refinement?.iterations).toBe(0);
      expect(result.refinement?.acceptedSwaps).toBe(0);
    });
  });

  describe('tour refinement and optimization (CA-06, CA-07)', () => {
    it('refines an improvable crossing circuit and achieves strictly shorter distance than NN', () => {
      // Arrange
      const options = createStopOrderingOptions();
      const baseResult = baseNN.order(CROSSING_CIRCUIT_CANDIDATES, options);

      // Act
      const result = algorithm.order(CROSSING_CIRCUIT_CANDIDATES, options);

      // Assert
      expect(result.refinement).not.toBeNull();
      expect(result.refinement?.acceptedSwaps).toBeGreaterThanOrEqual(1);
      expect(result.refinement?.improvementMeters).toBeGreaterThan(0);
      expect(result.totalDistanceMeters).toBeLessThan(baseResult.totalDistanceMeters);
      expect(result.totalDistanceMeters).toBeCloseTo(
        baseResult.totalDistanceMeters - (result.refinement?.improvementMeters ?? 0),
        5,
      );
    });

    it('terminates with NO_IMPROVEMENT on already-optimal collinear stops', () => {
      // Arrange
      const options = createStopOrderingOptions();
      const baseResult = baseNN.order(COLLINEAR_CANDIDATES, options);

      // Act
      const result = algorithm.order(COLLINEAR_CANDIDATES, options);

      // Assert
      expect(result.refinement?.terminationReason).toBe('NO_IMPROVEMENT');
      expect(result.refinement?.acceptedSwaps).toBe(0);
      expect(result.refinement?.improvementMeters).toBe(0);
      expect(result.stops.map((s) => s.packageId)).toEqual(
        baseResult.stops.map((s) => s.packageId),
      );
    });

    it('stops with MAX_ITERATIONS when maxIterations is set to 0', () => {
      // Arrange
      const options = createStopOrderingOptions({
        twoOpt: { maxIterations: 0, minImprovementMeters: 0.000001 },
      });
      const baseResult = baseNN.order(CROSSING_CIRCUIT_CANDIDATES, options);

      // Act
      const result = algorithm.order(CROSSING_CIRCUIT_CANDIDATES, options);

      // Assert
      expect(result.refinement?.terminationReason).toBe('MAX_ITERATIONS');
      expect(result.refinement?.iterations).toBe(0);
      expect(result.refinement?.acceptedSwaps).toBe(0);
      expect(result.totalDistanceMeters).toBeCloseTo(baseResult.totalDistanceMeters, 5);
    });

    it('bounds execution to exactly 1 iteration when maxIterations is 1', () => {
      // Arrange
      const options = createStopOrderingOptions({
        twoOpt: { maxIterations: 1, minImprovementMeters: 0.000001 },
      });

      // Act
      const result = algorithm.order(CROSSING_CIRCUIT_CANDIDATES, options);

      // Assert
      expect(result.refinement?.iterations).toBe(1);
      expect(result.refinement?.terminationReason).toBe('MAX_ITERATIONS');
    });

    it('terminates with NO_IMPROVEMENT when tolerance exceeds possible gain', () => {
      // Arrange: Extremely high minImprovementMeters (1,000,000 meters)
      const options = createStopOrderingOptions({
        twoOpt: { maxIterations: 100, minImprovementMeters: 1_000_000 },
      });

      // Act
      const result = algorithm.order(CROSSING_CIRCUIT_CANDIDATES, options);

      // Assert
      expect(result.refinement?.terminationReason).toBe('NO_IMPROVEMENT');
      expect(result.refinement?.acceptedSwaps).toBe(0);
    });
  });

  describe('determinism and immutability (CA-05)', () => {
    it('produces identical output for permuted candidate input orders', () => {
      // Arrange
      const options = createStopOrderingOptions();
      const reversedCandidates = [...CROSSING_CIRCUIT_CANDIDATES].reverse();

      // Act
      const forwardResult = algorithm.order(CROSSING_CIRCUIT_CANDIDATES, options);
      const reversedResult = algorithm.order(reversedCandidates, options);

      // Assert
      expect(forwardResult).toEqual(reversedResult);
    });

    it('freezes the output sequence and refinement structures', () => {
      // Arrange
      const options = createStopOrderingOptions();

      // Act
      const result = algorithm.order(CROSSING_CIRCUIT_CANDIDATES, options);

      // Assert
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.stops)).toBe(true);
      expect(Object.isFrozen(result.refinement)).toBe(true);
    });
  });
});
