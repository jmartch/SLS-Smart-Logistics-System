import {
  DeliveryForbiddenError,
  DeliveryNotFoundError,
} from '../../domain/delivery-errors';
import type { DeliveryAccessPort } from '../ports/delivery-access.port';
import type { DeliveryUnitOfWork } from '../ports/delivery-unit-of-work';

export interface GetDeliveryManifestQuery {
  readonly tenantId: string;
  readonly actorUserId: string;
  readonly routeId: string;
  readonly view: 'all' | 'pending' | 'failed';
}

export interface StopManifestEntry {
  readonly stopId: string;
  readonly stopNumber: number;
  readonly state: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly packageIds: readonly string[];
}

export interface GetDeliveryManifestResult {
  readonly routeId: string;
  readonly view: 'all' | 'pending' | 'failed';
  readonly stops: readonly StopManifestEntry[];
}

export class GetDeliveryManifestUseCase {
  constructor(
    private readonly unitOfWork: DeliveryUnitOfWork,
    private readonly accessPort: DeliveryAccessPort,
  ) {}

  async execute(
    query: GetDeliveryManifestQuery,
  ): Promise<GetDeliveryManifestResult> {
    const { tenantId, actorUserId, routeId, view } = query;

    return this.unitOfWork.run(tenantId, async (session) => {
      const route = await session.lockRoute(routeId);
      if (!route || route.tenantId !== tenantId) {
        throw new DeliveryNotFoundError(routeId, 'Route');
      }

      const canView = await this.accessPort.canViewDeliveries(
        tenantId,
        actorUserId,
        route.courierId,
      );
      if (!canView) {
        throw new DeliveryForbiddenError(
          'Actor is not authorized to view route delivery manifest',
        );
      }

      // Consumir el patrón GoF Iterator de Route (D3 de ADR-007)
      const iterator =
        view === 'failed'
          ? route.createFailedIterator()
          : view === 'pending'
            ? route.createPendingIterator()
            : route.createIterator();

      const stops: StopManifestEntry[] = [];

      while (iterator.hasNext()) {
        const stop = iterator.next();
        if (stop) {
          const packageIds = await session.getStopActivePackageIds(stop.id);
          stops.push({
            stopId: stop.id,
            stopNumber: stop.stopNumber,
            state: stop.state,
            latitude: stop.latitude,
            longitude: stop.longitude,
            packageIds,
          });
        }
      }

      return {
        routeId,
        view,
        stops,
      };
    });
  }
}
