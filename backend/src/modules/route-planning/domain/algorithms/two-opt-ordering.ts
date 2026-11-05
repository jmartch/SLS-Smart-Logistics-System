import type {
  OrderedRouteSequence,
  StopCandidateInput,
  StopOrderingOptions,
  TwoOptTerminationReason,
} from '../models/stop-ordering.types';
import type { StopOrderingAlgorithm } from './stop-ordering-algorithm';
import { NearestNeighborOrdering } from './nearest-neighbor-ordering';
import {
  calculateCircuitDistance,
  materializeRouteSequence,
} from './route-sequence';

export class TwoOptOrdering implements StopOrderingAlgorithm {
  public readonly name = 'nearest-neighbor-two-opt' as const;
  public readonly version = '1' as const;

  private readonly nearestNeighbor: NearestNeighborOrdering;

  public constructor() {
    this.nearestNeighbor = new NearestNeighborOrdering();
  }

  public order(
    candidates: readonly StopCandidateInput[],
    options: StopOrderingOptions,
  ): OrderedRouteSequence {
    // 1. Obtener la ruta base inicial mediante Nearest-Neighbor (valida la entrada completamente)
    const baseSequence = this.nearestNeighbor.order(candidates, options);

    const maxIterations = options.twoOpt?.maxIterations ?? 100;
    const minImprovementMeters = options.twoOpt?.minImprovementMeters ?? 0.000001;

    const initialTotal = baseSequence.totalDistanceMeters;
    let currentTotal = initialTotal;
    let iterations = 0;
    let acceptedSwaps = 0;
    let terminationReason: TwoOptTerminationReason;

    // 2. Rutas triviales (n <= 2): prevalece TRIVIAL_ROUTE con 0 pasadas
    if (baseSequence.stops.length <= 2) {
      terminationReason = 'TRIVIAL_ROUTE';
      return materializeRouteSequence(
        baseSequence.stops,
        options.origin,
        options.tenantId,
        this.name,
        {
          initialDistanceMeters: initialTotal,
          improvementMeters: 0,
          iterations: 0,
          acceptedSwaps: 0,
          maxIterations,
          minImprovementMeters,
          terminationReason,
        },
      );
    }

    // 3. Caso n >= 3 y límite de iteraciones 0
    if (maxIterations === 0) {
      terminationReason = 'MAX_ITERATIONS';
      return materializeRouteSequence(
        baseSequence.stops,
        options.origin,
        options.tenantId,
        this.name,
        {
          initialDistanceMeters: initialTotal,
          improvementMeters: 0,
          iterations: 0,
          acceptedSwaps: 0,
          maxIterations,
          minImprovementMeters,
          terminationReason,
        },
      );
    }

    // 4. Refinamiento 2-opt first-improvement acotado
    let currentRoute: StopCandidateInput[] = baseSequence.stops.map((stop) => ({
      packageId: stop.packageId,
      tenantId: stop.tenantId,
      coordinates: stop.coordinates,
    }));
    const n = currentRoute.length;
    terminationReason = 'MAX_ITERATIONS';

    while (iterations < maxIterations) {
      iterations++;
      let accepted = false;

      for (let i = 0; i < n - 1; i++) {
        for (let j = i + 1; j < n; j++) {
          // Omitir inversión de la ruta completa (i=0, j=n-1) por ser el mismo circuito en reversa
          if (i === 0 && j === n - 1) {
            continue;
          }

          // Inversión inclusiva del segmento [i, j]
          const candidateRoute = [
            ...currentRoute.slice(0, i),
            ...currentRoute.slice(i, j + 1).reverse(),
            ...currentRoute.slice(j + 1),
          ];

          const candidateTotal = calculateCircuitDistance(
            candidateRoute,
            options.origin,
          );
          const gain = currentTotal - candidateTotal;

          if (candidateTotal < currentTotal && gain > minImprovementMeters) {
            currentRoute = candidateRoute;
            currentTotal = candidateTotal;
            acceptedSwaps++;
            accepted = true;
            break;
          }
        }

        if (accepted) {
          break;
        }
      }

      if (!accepted) {
        terminationReason = 'NO_IMPROVEMENT';
        break;
      }
    }

    const improvementMeters = Math.max(0, initialTotal - currentTotal);

    return materializeRouteSequence(
      currentRoute,
      options.origin,
      options.tenantId,
      this.name,
      {
        initialDistanceMeters: initialTotal,
        improvementMeters,
        iterations,
        acceptedSwaps,
        maxIterations,
        minImprovementMeters,
        terminationReason,
      },
    );
  }
}
