import { GetRouteSummaryUseCase } from '../application/use-cases/get-route-summary.use-case';
import { RouteSummaryReaderPort } from '../application/ports/route-summary-reader.port';
import { Route } from '../domain/route';
import { RouteState } from '../domain/route-state';
import {
  RouteNotFoundError,
  RouteForbiddenError,
  RouteNotCompletedError,
} from '../domain/route-errors';
import {
  InMemoryRouteRepository,
  FakeRouteAccessPort,
} from './fixtures/route-use-case.doubles';
import { createRoutePropsFixture } from './fixtures/route.fixtures';

class FakeRouteSummaryReaderPort implements RouteSummaryReaderPort {
  summaries = new Map<string, Record<string, unknown>>();

  async findSummaryByRouteId(
    tenantId: string,
    routeId: string,
  ): Promise<Record<string, unknown> | null> {
    return this.summaries.get(`${tenantId}:${routeId}`) ?? null;
  }
}

describe('GetRouteSummaryUseCase (CA-01, CA-04, CA-05, CA-10)', () => {
  let routeRepository: InMemoryRouteRepository;
  let summaryReader: FakeRouteSummaryReaderPort;
  let accessPort: FakeRouteAccessPort;
  let useCase: GetRouteSummaryUseCase;

  const tenantId = 'tenant-a';
  const routeId = 'route-100';
  const courierId = 'courier-1';
  const sampleSnapshot: Record<string, unknown> = {
    schemaVersion: 1,
    closureId: 'closure-uuid-1',
    tenantId,
    routeId,
    mode: 'FORCED',
    actorUserId: 'user-coord',
    reasonCode: 'VEHICLE_BREAKDOWN',
    notes: 'Internal incident notes: engine overheating.',
    totalAssigned: 5,
    deliveredCount: 3,
    failedCount: 1,
    rescheduledCount: 0,
    returnedCount: 0,
    pendingCount: 1,
    deliveryEffectivenessRatio: 0.6,
  };

  beforeEach(() => {
    routeRepository = new InMemoryRouteRepository();
    summaryReader = new FakeRouteSummaryReaderPort();
    accessPort = new FakeRouteAccessPort();
    useCase = new GetRouteSummaryUseCase(
      routeRepository,
      summaryReader,
      accessPort,
    );
  });

  function setupCompletedRoute(): Route {
    const route = new Route(
      createRoutePropsFixture({
        id: routeId,
        tenantId,
        courierId,
        state: RouteState.COMPLETED,
        startedAt: new Date('2026-10-06T08:00:00Z'),
        completedAt: new Date('2026-10-06T12:00:00Z'),
      }),
    );
    routeRepository.save(route);
    summaryReader.summaries.set(`${tenantId}:${routeId}`, { ...sampleSnapshot });
    return route;
  }

  it('returns full summary snapshot for coordinator/admin users', async () => {
    setupCompletedRoute();
    accessPort.courierIdToReturn = null; // Actor no es courier (es coordinador/admin)
    accessPort.canViewSummary = true;

    const result = await useCase.execute({
      tenantId,
      routeId,
      actorUserId: 'user-coord',
    });

    expect(result).toBeDefined();
    expect(result.closureId).toBe('closure-uuid-1');
    expect(result.totalAssigned).toBe(5);
    expect(result.notes).toBe('Internal incident notes: engine overheating.');
    expect(result.reasonCode).toBe('VEHICLE_BREAKDOWN');
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('returns redacted projection for the assigned courier (hiding internal notes and reasonCode)', async () => {
    setupCompletedRoute();
    accessPort.courierIdToReturn = courierId; // Actor es el courier asignado a la ruta
    accessPort.canViewSummary = true;

    const result = await useCase.execute({
      tenantId,
      routeId,
      actorUserId: 'courier-user-1',
    });

    expect(result).toBeDefined();
    expect(result.closureId).toBe('closure-uuid-1');
    expect(result.totalAssigned).toBe(5);
    expect(result.deliveredCount).toBe(3);

    // Privacidad por rol: notas y motivo interno redactados
    expect(result.notes).toBeUndefined();
    expect(result.reasonCode).toBeUndefined();
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('rejects with RouteNotFoundError if route does not exist', async () => {
    await expect(
      useCase.execute({
        tenantId,
        routeId: 'route-nonexistent',
        actorUserId: 'user-coord',
      }),
    ).rejects.toThrow(RouteNotFoundError);
  });

  it('rejects with RouteNotCompletedError (409) if route is still open (IN_PROGRESS)', async () => {
    const route = new Route(
      createRoutePropsFixture({
        id: routeId,
        tenantId,
        courierId,
        state: RouteState.IN_PROGRESS,
        startedAt: new Date('2026-10-06T08:00:00Z'),
      }),
    );
    await routeRepository.save(route);

    await expect(
      useCase.execute({
        tenantId,
        routeId,
        actorUserId: 'user-coord',
      }),
    ).rejects.toThrow(RouteNotCompletedError);
  });

  it('rejects with RouteNotCompletedError if route is PLANNED or READY', async () => {
    const route = new Route(
      createRoutePropsFixture({
        id: routeId,
        tenantId,
        courierId,
        state: RouteState.READY,
      }),
    );
    await routeRepository.save(route);

    await expect(
      useCase.execute({
        tenantId,
        routeId,
        actorUserId: 'user-coord',
      }),
    ).rejects.toThrow(RouteNotCompletedError);
  });

  it('rejects with RouteForbiddenError if actor is not authorized to view the summary', async () => {
    setupCompletedRoute();
    accessPort.canViewSummary = false;

    await expect(
      useCase.execute({
        tenantId,
        routeId,
        actorUserId: 'unauthorized-user',
      }),
    ).rejects.toThrow(RouteForbiddenError);
  });

  it('rejects with RouteNotCompletedError if route is COMPLETED but snapshot is missing', async () => {
    const route = new Route(
      createRoutePropsFixture({
        id: routeId,
        tenantId,
        courierId,
        state: RouteState.COMPLETED,
        startedAt: new Date('2026-10-06T08:00:00Z'),
        completedAt: new Date('2026-10-06T12:00:00Z'),
      }),
    );
    await routeRepository.save(route);
    // No snapshot in reader!

    await expect(
      useCase.execute({
        tenantId,
        routeId,
        actorUserId: 'user-coord',
      }),
    ).rejects.toThrow(RouteNotCompletedError);
  });
});
