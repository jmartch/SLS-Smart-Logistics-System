import { Route } from '../../domain/route';
import {
  RouteRepository,
  ListRoutesRepositoryFilter,
  RouteSummaryProjection,
} from '../../domain/route.repository';
import {
  RouteLifecycleUnitOfWork,
  RouteLifecycleSession,
  RoutePackageWriterPort,
  RouteAssignmentWriterPort,
  RouteAuditPort,
  RouteOutboxPort,
  RoutePackageSnapshot,
  PackageStateUpdateItem,
  PackageStatusHistoryItem,
  RouteAssignmentSnapshot,
  RouteAuditLogEntry,
  RouteOutboxEventEntry,
} from '../../application/ports/route-lifecycle-unit-of-work';
import { RouteAccessPort } from '../../application/ports/route-access.port';
import {
  RouteResourcesPort,
  RouteResourceValidationResult,
} from '../../application/ports/route-resources.port';

export class InMemoryRouteRepository implements RouteRepository {
  private readonly routes = new Map<string, Route>();
  summaries: RouteSummaryProjection[] = [];

  async findById(tenantId: string, id: string): Promise<Route | null> {
    const route = this.routes.get(`${tenantId}:${id}`);
    return route ?? null;
  }

  async save(route: Route): Promise<void> {
    this.routes.set(`${route.tenantId}:${route.id}`, route);
  }

  async findMany(
    tenantId: string,
    filter: ListRoutesRepositoryFilter,
  ): Promise<{ items: readonly RouteSummaryProjection[]; total: number }> {
    let list = this.summaries.filter((s) => s.tenantId === tenantId);

    if (this.summaries.length === 0 && this.routes.size > 0) {
      list = Array.from(this.routes.values())
        .filter((r) => r.tenantId === tenantId)
        .map((r) => ({
          id: r.id,
          tenantId: r.tenantId,
          state: r.state,
          vehicleId: r.vehicleId,
          courierId: r.courierId,
          depotId: r.depotId,
          zoneId: null,
          plannedStartAt: r.plannedStartAt ?? null,
          plannedEndAt: r.plannedEndAt ?? null,
          startedAt: r.startedAt ?? null,
          completedAt: r.completedAt ?? null,
          stopCount: r.stops.length,
        }));
    }

    if (filter.courierId) {
      list = list.filter((r) => r.courierId === filter.courierId);
    }
    if (filter.state) {
      list = list.filter((r) => r.state === filter.state);
    }
    if (filter.zoneId) {
      list = list.filter((r) => r.zoneId === filter.zoneId);
    }
    if (filter.from) {
      list = list.filter(
        (r) => r.plannedStartAt && r.plannedStartAt >= filter.from!,
      );
    }
    if (filter.to) {
      list = list.filter(
        (r) => r.plannedStartAt && r.plannedStartAt <= filter.to!,
      );
    }

    const total = list.length;
    const startIndex = (filter.page - 1) * filter.pageSize;
    const items = list.slice(startIndex, startIndex + filter.pageSize);

    return { items, total };
  }

  seed(route: Route): void {
    this.routes.set(`${route.tenantId}:${route.id}`, route);
  }
}

export class InMemoryRoutePackageWriter implements RoutePackageWriterPort {
  packages: RoutePackageSnapshot[] = [];
  readonly updatedStates: PackageStateUpdateItem[] = [];
  readonly recordedHistories: PackageStatusHistoryItem[] = [];

  async findPackagesByRouteId(
    _tenantId: string,
    _routeId: string,
  ): Promise<readonly RoutePackageSnapshot[]> {
    return Object.freeze([...this.packages]);
  }

  async updatePackageStates(
    _tenantId: string,
    updates: readonly PackageStateUpdateItem[],
  ): Promise<void> {
    this.updatedStates.push(...updates);
    for (const update of updates) {
      const idx = this.packages.findIndex((p) => p.id === update.packageId);
      if (idx !== -1 && this.packages[idx]) {
        this.packages[idx] = {
          ...this.packages[idx],
          currentState: update.nextState,
        };
      }
    }
  }

  async recordStatusHistories(
    _tenantId: string,
    histories: readonly PackageStatusHistoryItem[],
  ): Promise<void> {
    this.recordedHistories.push(...histories);
  }
}

export class InMemoryRouteAssignmentWriter implements RouteAssignmentWriterPort {
  assignments: RouteAssignmentSnapshot[] = [];
  readonly cancelledRouteIds: string[] = [];

  async findActiveAssignmentsByRouteId(
    _tenantId: string,
    _routeId: string,
  ): Promise<readonly RouteAssignmentSnapshot[]> {
    return Object.freeze(this.assignments.filter((a) => a.status === 'ACTIVE'));
  }

  async cancelAssignmentsByRouteId(
    _tenantId: string,
    routeId: string,
    _reasonCode: string,
    _endedAt: Date,
  ): Promise<number> {
    this.cancelledRouteIds.push(routeId);
    let count = 0;
    this.assignments = this.assignments.map((a) => {
      if (a.routeId === routeId && a.status === 'ACTIVE') {
        count++;
        return { ...a, status: 'CANCELLED' as const };
      }
      return a;
    });
    return count;
  }
}

export class InMemoryRouteAuditPort implements RouteAuditPort {
  readonly logs: RouteAuditLogEntry[] = [];

  async recordAuditLog(entry: RouteAuditLogEntry): Promise<void> {
    this.logs.push(entry);
  }
}

export class InMemoryRouteOutboxPort implements RouteOutboxPort {
  readonly recordedEvents: RouteOutboxEventEntry[] = [];

  async recordEvents(events: readonly RouteOutboxEventEntry[]): Promise<void> {
    this.recordedEvents.push(...events);
  }
}

export class FakeRouteLifecycleUnitOfWork implements RouteLifecycleUnitOfWork {
  readonly routes = new InMemoryRouteRepository();
  readonly packages = new InMemoryRoutePackageWriter();
  readonly assignments = new InMemoryRouteAssignmentWriter();
  readonly audit = new InMemoryRouteAuditPort();
  readonly outbox = new InMemoryRouteOutboxPort();

  shouldFailOnCommit = false;
  transactionCount = 0;

  async executeInTransaction<T>(
    _tenantId: string,
    operation: (session: RouteLifecycleSession) => Promise<T>,
  ): Promise<T> {
    this.transactionCount++;
    const session: RouteLifecycleSession = {
      routes: this.routes,
      packages: this.packages,
      assignments: this.assignments,
      audit: this.audit,
      outbox: this.outbox,
    };

    const result = await operation(session);

    if (this.shouldFailOnCommit) {
      throw new Error('Transaction commit failed');
    }

    return result;
  }
}

export class FakeRouteAccessPort implements RouteAccessPort {
  canPrepare = true;
  canStart = true;
  canCancel = true;
  canInterrupt = true;
  canView = true;
  courierIdToReturn: string | null = 'courier-1';

  async canPrepareRoute(
    _tenantId: string,
    _actorUserId: string,
  ): Promise<boolean> {
    return this.canPrepare;
  }

  async canStartRoute(
    _tenantId: string,
    _actorUserId: string,
    _routeCourierId: string,
  ): Promise<boolean> {
    return this.canStart;
  }

  async canCancelRoute(
    _tenantId: string,
    _actorUserId: string,
  ): Promise<boolean> {
    return this.canCancel;
  }

  async canInterruptRoute(
    _tenantId: string,
    _actorUserId: string,
    _routeCourierId: string,
  ): Promise<boolean> {
    return this.canInterrupt;
  }

  async canViewRoute(
    _tenantId: string,
    _actorUserId: string,
    _routeCourierId: string,
  ): Promise<boolean> {
    return this.canView;
  }

  async getCourierIdForUser(
    _tenantId: string,
    _userId: string,
  ): Promise<string | null> {
    return this.courierIdToReturn;
  }
}

export class FakeRouteResourcesPort implements RouteResourcesPort {
  validationResult: RouteResourceValidationResult = {
    isValid: true,
  };

  async validateResourcesForRoute(
    _tenantId: string,
    _routeId: string,
    _vehicleId: string,
    _courierId: string,
    _depotId?: string | null,
    _windowStart?: Date | null,
    _windowEnd?: Date | null,
  ): Promise<RouteResourceValidationResult> {
    return this.validationResult;
  }
}
