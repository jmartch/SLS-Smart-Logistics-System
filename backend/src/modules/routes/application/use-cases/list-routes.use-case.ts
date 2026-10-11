import { RouteValidationError } from '../../domain/route-errors';
import { RouteRepository } from '../../domain/route.repository';
import { RouteAccessPort } from '../ports/route-access.port';
import {
  ListRoutesQuery,
  PaginatedRoutesResult,
} from '../ports/route-contracts';

export class ListRoutesUseCase {
  constructor(
    private readonly routeRepository: RouteRepository,
    private readonly accessPort: RouteAccessPort,
  ) {}

  async execute(query: ListRoutesQuery): Promise<PaginatedRoutesResult> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));

    let fromDate: Date | undefined;
    if (query.from) {
      fromDate = new Date(query.from);
      if (isNaN(fromDate.getTime())) {
        throw new RouteValidationError('Invalid "from" date filter');
      }
    }

    let toDate: Date | undefined;
    if (query.to) {
      toDate = new Date(query.to);
      if (isNaN(toDate.getTime())) {
        throw new RouteValidationError('Invalid "to" date filter');
      }
    }

    // Check if caller is restricted to a courier role
    const courierIdForUser = await this.accessPort.getCourierIdForUser(
      query.tenantId,
      query.actorUserId,
    );

    // If the actor is a courier, they can only view routes assigned to them
    const effectiveCourierId = courierIdForUser ?? query.courierId;

    const { items, total } = await this.routeRepository.findMany(
      query.tenantId,
      {
        page,
        pageSize,
        from: fromDate,
        to: toDate,
        zoneId: query.zoneId,
        state: query.state,
        courierId: effectiveCourierId,
      },
    );

    return {
      items: items.map((item) => ({
        id: item.id,
        tenantId: item.tenantId,
        state: item.state,
        vehicleId: item.vehicleId,
        courierId: item.courierId,
        depotId: item.depotId,
        zoneId: item.zoneId,
        plannedStartAt: item.plannedStartAt
          ? item.plannedStartAt.toISOString()
          : null,
        plannedEndAt: item.plannedEndAt
          ? item.plannedEndAt.toISOString()
          : null,
        startedAt: item.startedAt ? item.startedAt.toISOString() : null,
        completedAt: item.completedAt ? item.completedAt.toISOString() : null,
        stopCount: item.stopCount,
      })),
      page,
      pageSize,
      total,
    };
  }
}
