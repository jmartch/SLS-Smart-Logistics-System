import type { Coordinates } from '../coordinates';

export type StopOrderingName = 'nearest-neighbor' | 'nearest-neighbor-two-opt';

export interface StopCandidateInput {
    readonly packageId: string;
    readonly tenantId: string;
    readonly coordinates: Coordinates;
}

export interface StopOrderingOptions {
    readonly tenantId: string;
    readonly origin: Coordinates;
    readonly twoOpt?: Readonly<{
        maxIterations: number;
        minImprovementMeters: number;
    }>;
}

export interface OrderedStop {
    readonly packageId: string;
    readonly tenantId: string;
    readonly coordinates: Coordinates;
    readonly sequence: number;
    readonly distanceFromPreviousMeters: number;
    readonly cumulativeDistanceMeters: number;
}

export type TwoOptTerminationReason =
    | 'TRIVIAL_ROUTE'
    | 'NO_IMPROVEMENT'
    | 'MAX_ITERATIONS';

export interface OrderedRouteSequence {
    readonly tenantId: string;
    readonly origin: Coordinates;
    readonly algorithm: StopOrderingName;
    readonly algorithmVersion: '1';
    readonly stops: readonly OrderedStop[];
    readonly distanceToLastStopMeters: number;
    readonly returnToOriginMeters: number;
    readonly totalDistanceMeters: number;
    readonly refinement: Readonly<{
        initialDistanceMeters: number;
        improvementMeters: number;
        iterations: number;
        acceptedSwaps: number;
        maxIterations: number;
        minImprovementMeters: number;
        terminationReason: TwoOptTerminationReason;
    }> | null;
}