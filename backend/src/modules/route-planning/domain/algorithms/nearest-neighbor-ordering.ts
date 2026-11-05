import { calculateHaversineDistance } from '../haversine';
import type {
    OrderedRouteSequence,
    StopCandidateInput,
    StopOrderingOptions,
} from '../models/stop-ordering.types';
import type { StopOrderingAlgorithm } from './stop-ordering-algorithm';
import { validateStopOrderingInput } from './stop-ordering-input';
import { materializeRouteSequence } from './route-sequence';

export class NearestNeighborOrdering implements StopOrderingAlgorithm {
    public readonly name = 'nearest-neighbor' as const;
    public readonly version = '1' as const;

    public order(
        candidates: readonly StopCandidateInput[],
        options: StopOrderingOptions,
    ): OrderedRouteSequence {
        // 1. Validar precondiciones
        validateStopOrderingInput(candidates, options);

        if (candidates.length === 0) {
            return materializeRouteSequence(
                [],
                options.origin,
                options.tenantId,
                this.name,
                null,
            );
        }

        // 2. Copia inicial ordenada canónicamente por packageId ascendente (desempate determinista)
        const remaining = [...candidates].sort((a, b) =>
            a.packageId < b.packageId ? -1 : a.packageId > b.packageId ? 1 : 0,
        );

        let current = options.origin;
        const route: StopCandidateInput[] = [];

        // 3. Selección voraz: vecino más cercano con desempate ordinal por packageId
        while (remaining.length > 0) {
            let bestIndex = -1;
            let bestDistance = Number.POSITIVE_INFINITY;

            for (let i = 0; i < remaining.length; i++) {
                const candidate = remaining[i];
                const distance = calculateHaversineDistance(current, candidate.coordinates);

                if (
                    bestIndex === -1 ||
                    distance < bestDistance ||
                    (distance === bestDistance &&
                        candidate.packageId < remaining[bestIndex].packageId)
                ) {
                    bestIndex = i;
                    bestDistance = distance;
                }
            }

            const [selected] = remaining.splice(bestIndex, 1);
            route.push(selected);
            current = selected.coordinates;
        }

        // 4. Materializar métricas de distancia y circuito cerrado
        return materializeRouteSequence(
            route,
            options.origin,
            options.tenantId,
            this.name,
            null,
        );
    }
}