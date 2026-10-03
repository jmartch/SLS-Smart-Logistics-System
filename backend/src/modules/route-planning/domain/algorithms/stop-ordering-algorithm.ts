import type {
    OrderedRouteSequence,
    StopCandidateInput,
    StopOrderingName,
    StopOrderingOptions,
} from '../models/stop-ordering.types';

export interface StopOrderingAlgorithm {
    readonly name: StopOrderingName;
    readonly version: '1';
    order(
        candidates: readonly StopCandidateInput[],
        options: StopOrderingOptions,
    ): OrderedRouteSequence;
}