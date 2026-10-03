import { Coordinates } from '../domain/coordinates';
import { calculateHaversineDistance } from '../domain/haversine';
import { NearestNeighborOrdering } from '../domain/algorithms/nearest-neighbor-ordering';
import { InvalidStopOrderingInputError } from '../domain/models/invalid-stop-ordering-input.error';
import type { StopCandidateInput } from '../domain/models/stop-ordering.types';
import {
    ALT_TENANT_ID,
    COLLINEAR_CANDIDATES,
    DEFAULT_TENANT_ID,
    EMPTY_CANDIDATES,
    FIXED_ORIGIN,
    METERS_PER_DEGREE_EQUATOR,
    ORDINAL_TIE_CANDIDATES,
    SINGLE_CANDIDATE,
    TRIANGLE_CANDIDATES,
    TWO_CANDIDATES,
    createStopCandidate,
    createStopOrderingOptions,
} from './fixtures/stop-ordering.fixtures';

describe('NearestNeighborOrdering', () => {
    let algorithm: NearestNeighborOrdering;

    beforeEach(() => {
        algorithm = new NearestNeighborOrdering();
    });

    describe('metadata and contract', () => {
        it('declares the algorithm name and version 1', () => {
            expect(algorithm.name).toBe('nearest-neighbor');
            expect(algorithm.version).toBe('1');
        });
    });

    describe('valid tour construction and metrics (CA-01, CA-03, CA-04)', () => {
        it('returns an empty sequence with zero distances for empty candidates', () => {
            // Arrange
            const options = createStopOrderingOptions();

            // Act
            const result = algorithm.order(EMPTY_CANDIDATES, options);

            // Assert
            expect(result.stops).toHaveLength(0);
            expect(result.distanceToLastStopMeters).toBe(0);
            expect(result.returnToOriginMeters).toBe(0);
            expect(result.totalDistanceMeters).toBe(0);
            expect(result.refinement).toBeNull();
            expect(result.algorithm).toBe('nearest-neighbor');
            expect(result.algorithmVersion).toBe('1');
        });

        it('orders a single stop measuring leg and return independently', () => {
            // Arrange
            const options = createStopOrderingOptions();
            const expectedLeg = 0.01 * METERS_PER_DEGREE_EQUATOR;

            // Act
            const result = algorithm.order(SINGLE_CANDIDATE, options);

            // Assert
            expect(result.stops).toHaveLength(1);
            expect(result.stops[0].packageId).toBe('pkg-1');
            expect(result.stops[0].sequence).toBe(1);
            expect(result.stops[0].distanceFromPreviousMeters).toBeCloseTo(expectedLeg, 5);
            expect(result.stops[0].cumulativeDistanceMeters).toBeCloseTo(expectedLeg, 5);
            expect(result.distanceToLastStopMeters).toBeCloseTo(expectedLeg, 5);
            expect(result.returnToOriginMeters).toBeCloseTo(expectedLeg, 5);
            expect(result.totalDistanceMeters).toBeCloseTo(2 * expectedLeg, 5);
        });

        it('orders collinear stops incrementally along the axis', () => {
            // Arrange
            const options = createStopOrderingOptions();
            const expectedStep = 0.01 * METERS_PER_DEGREE_EQUATOR;

            // Act
            const result = algorithm.order(COLLINEAR_CANDIDATES, options);

            // Assert
            expect(result.stops.map((s) => s.packageId)).toEqual(['pkg-1', 'pkg-2', 'pkg-3']);
            expect(result.stops[0].distanceFromPreviousMeters).toBeCloseTo(expectedStep, 5);
            expect(result.stops[1].distanceFromPreviousMeters).toBeCloseTo(expectedStep, 5);
            expect(result.stops[2].distanceFromPreviousMeters).toBeCloseTo(expectedStep, 5);
            expect(result.distanceToLastStopMeters).toBeCloseTo(3 * expectedStep, 5);
            expect(result.returnToOriginMeters).toBeCloseTo(3 * expectedStep, 5);
            expect(result.totalDistanceMeters).toBeCloseTo(6 * expectedStep, 5);
        });
    });

    describe('tie-breaking and determinism (CA-02, CA-05)', () => {
        it('breaks distance ties using ascending ordinal packageId', () => {
            // Arrange
            const options = createStopOrderingOptions();

            // Act: 'pkg-10' < 'pkg-2' in UTF-16 ordinal comparison
            const result = algorithm.order(ORDINAL_TIE_CANDIDATES, options);

            // Assert
            expect(result.stops.map((s) => s.packageId)).toEqual(['pkg-10', 'pkg-2']);
        });

        it('produces identical output regardless of candidate input order', () => {
            // Arrange
            const options = createStopOrderingOptions();
            const reversedCollinear = [...COLLINEAR_CANDIDATES].reverse();

            // Act
            const forwardResult = algorithm.order(COLLINEAR_CANDIDATES, options);
            const reverseResult = algorithm.order(reversedCollinear, options);

            // Assert
            expect(forwardResult).toEqual(reverseResult);
        });

        it('returns deeply frozen output structures', () => {
            // Arrange
            const options = createStopOrderingOptions();

            // Act
            const result = algorithm.order(TWO_CANDIDATES, options);

            // Assert
            expect(Object.isFrozen(result)).toBe(true);
            expect(Object.isFrozen(result.stops)).toBe(true);
            expect(Object.isFrozen(result.stops[0])).toBe(true);
        });
    });

    describe('input validation and error handling (CA-08)', () => {
        it('rejects candidates from a different tenant', () => {
            // Arrange
            const options = createStopOrderingOptions({ tenantId: DEFAULT_TENANT_ID });
            const mixedCandidates: StopCandidateInput[] = [
                createStopCandidate('pkg-1', 0, 0.01, DEFAULT_TENANT_ID),
                createStopCandidate('pkg-2', 0, 0.02, ALT_TENANT_ID),
            ];

            // Act & Assert
            expect(() => algorithm.order(mixedCandidates, options)).toThrow(
                InvalidStopOrderingInputError,
            );
            try {
                algorithm.order(mixedCandidates, options);
            } catch (err: any) {
                expect(err.reason).toBe('TENANT_MISMATCH');
            }
        });

        it('rejects duplicate package IDs', () => {
            // Arrange
            const options = createStopOrderingOptions();
            const duplicateCandidates: StopCandidateInput[] = [
                createStopCandidate('pkg-dup', 0, 0.01),
                createStopCandidate('pkg-dup', 0, 0.02),
            ];

            // Act & Assert
            expect(() => algorithm.order(duplicateCandidates, options)).toThrow(
                InvalidStopOrderingInputError,
            );
            try {
                algorithm.order(duplicateCandidates, options);
            } catch (err: any) {
                expect(err.reason).toBe('DUPLICATE_PACKAGE_ID');
            }
        });

        it('rejects empty or blank package IDs', () => {
            // Arrange
            const options = createStopOrderingOptions();
            const invalidCandidates: StopCandidateInput[] = [
                createStopCandidate('   ', 0, 0.01),
            ];

            // Act & Assert
            expect(() => algorithm.order(invalidCandidates, options)).toThrow(
                InvalidStopOrderingInputError,
            );
            try {
                algorithm.order(invalidCandidates, options);
            } catch (err: any) {
                expect(err.reason).toBe('INVALID_PACKAGE_ID');
            }
        });
    });
});