import { ListRoutesUseCase } from '../application/use-cases/list-routes.use-case';
import { RouteState } from '../domain/route-state';
import { RouteValidationError } from '../domain/route-errors';
import {
  InMemoryRouteRepository,
  FakeRouteAccessPort,
} from './fixtures/route-use-case.doubles';
import { ListRoutesQuery } from '../application/ports/route-contracts';
import { RouteSummaryProjection } from '../domain/route.repository';

function createTestContext() {
  const repository = new InMemoryRouteRepository();
  const accessPort = new FakeRouteAccessPort();
  // Default coordinator: actor is not a courier
  accessPort.courierIdToReturn = null;
  const useCase = new ListRoutesUseCase(repository, accessPort);

  return { repository, accessPort, useCase };
}

function createQuery(overrides?: Partial<ListRoutesQuery>): ListRoutesQuery {
  return {
    tenantId: overrides?.tenantId ?? 'tenant-a',
    actorUserId: overrides?.actorUserId ?? 'user-coordinator',
    correlationId: overrides?.correlationId ?? 'corr-list-1',
    ...overrides,
  };
}

function createSummary(
  id: string,
  overrides?: Partial<RouteSummaryProjection>,
): RouteSummaryProjection {
  return {
    id,
    tenantId: 'tenant-a',
    state: RouteState.PLANNED,
    vehicleId: 'veh-1',
    courierId: 'courier-1',
    depotId: 'depot-1',
    zoneId: 'zone-north',
    plannedStartAt: new Date('2026-10-06T08:00:00Z'),
    plannedEndAt: new Date('2026-10-06T12:00:00Z'),
    startedAt: null,
    completedAt: null,
    stopCount: 5,
    ...overrides,
  };
}

describe('ListRoutesUseCase', () => {
  it('rejects when "from" date filter is invalid', async () => {
    // Arrange
    const { useCase } = createTestContext();
    const query = createQuery({ from: 'not-a-valid-date' });

    // Act
    const act = () => useCase.execute(query);

    // Assert
    await expect(act).rejects.toThrow(RouteValidationError);
    await expect(act).rejects.toThrow(/invalid "from" date/i);
  });

  it('rejects when "to" date filter is invalid', async () => {
    // Arrange
    const { useCase } = createTestContext();
    const query = createQuery({ to: 'invalid-date' });

    // Act
    const act = () => useCase.execute(query);

    // Assert
    await expect(act).rejects.toThrow(RouteValidationError);
    await expect(act).rejects.toThrow(/invalid "to" date/i);
  });

  it('returns paginated route summaries with correct boundaries', async () => {
    // Arrange
    const { useCase, repository } = createTestContext();
    repository.summaries = [
      createSummary('r-1'),
      createSummary('r-2'),
      createSummary('r-3'),
      createSummary('r-4'),
      createSummary('r-5'),
    ];
    const query = createQuery({ page: 2, pageSize: 2 });

    // Act
    const result = await useCase.execute(query);

    // Assert
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(2);
    expect(result.total).toBe(5);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]?.id).toBe('r-3');
    expect(result.items[1]?.id).toBe('r-4');
    expect(result.items[0]?.stopCount).toBe(5);
  });

  it('applies state and zone filters accurately', async () => {
    // Arrange
    const { useCase, repository } = createTestContext();
    repository.summaries = [
      createSummary('r-1', { state: RouteState.PLANNED, zoneId: 'zone-north' }),
      createSummary('r-2', { state: RouteState.READY, zoneId: 'zone-north' }),
      createSummary('r-3', { state: RouteState.READY, zoneId: 'zone-south' }),
    ];
    const query = createQuery({
      state: RouteState.READY,
      zoneId: 'zone-north',
    });

    // Act
    const result = await useCase.execute(query);

    // Assert
    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe('r-2');
    expect(result.items[0]?.state).toBe(RouteState.READY);
  });

  it('automatically scopes results to actor courier identity', async () => {
    // Arrange
    const { useCase, repository, accessPort } = createTestContext();
    // Actor is courier 'courier-me'
    accessPort.courierIdToReturn = 'courier-me';

    repository.summaries = [
      createSummary('r-1', { courierId: 'courier-me' }),
      createSummary('r-2', { courierId: 'other-courier' }),
      createSummary('r-3', { courierId: 'courier-me' }),
    ];

    // Actor attempts to pass courierId: 'other-courier' in query
    const query = createQuery({
      actorUserId: 'user-courier-me',
      courierId: 'other-courier',
    });

    // Act
    const result = await useCase.execute(query);

    // Assert: actor is strictly restricted to their own assigned routes
    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(2);
    for (const item of result.items) {
      expect(item.courierId).toBe('courier-me');
    }
  });

  it('returns empty list and total 0 when no routes match criteria', async () => {
    // Arrange
    const { useCase, repository } = createTestContext();
    repository.summaries = [
      createSummary('r-1', { state: RouteState.PLANNED }),
    ];
    const query = createQuery({ state: RouteState.COMPLETED });

    // Act
    const result = await useCase.execute(query);

    // Assert
    expect(result.total).toBe(0);
    expect(result.items).toHaveLength(0);
  });

  it('preserves enriched vehicle, courier, depot, and zone names in summaries', async () => {
    // Arrange
    const { useCase, repository } = createTestContext();
    repository.summaries = [
      createSummary('r-enriched', {
        vehiclePlate: 'TRK-555',
        courierEmail: 'driver@sls.local',
        depotName: 'Depósito Norte',
        zoneName: 'Zona Norte',
      }),
    ];
    const query = createQuery();

    // Act
    const result = await useCase.execute(query);

    // Assert
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.vehiclePlate).toBe('TRK-555');
    expect(result.items[0]?.courierEmail).toBe('driver@sls.local');
    expect(result.items[0]?.depotName).toBe('Depósito Norte');
    expect(result.items[0]?.zoneName).toBe('Zona Norte');
  });
});
