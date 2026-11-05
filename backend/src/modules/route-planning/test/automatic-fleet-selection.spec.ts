import { ClusterPackagesService } from '../application/cluster-packages.service';
import { OrderRouteStopsService } from '../application/order-route-stops.service';
import { PlanAndAssignRoutesService } from '../application/plan-and-assign-routes.service';
import type { PlanningBatchSnapshot } from '../application/ports/planning-assignment-unit-of-work';
import { NearestNeighborOrdering } from '../domain/algorithms/nearest-neighbor-ordering';
import {
  ALT_TENANT_ID,
  createPlanAndAssignCommand,
  createPlanningCourier,
  createPlanningDepot,
  createPlanningExecutionContext,
  createPlanningPackage,
  createPlanningVehicle,
  InMemoryPlanningAssignmentUnitOfWork,
} from './fixtures/assignment-planning.fixtures';

function createTestContext(overrides: Partial<PlanningBatchSnapshot> = {}) {
  const uow = new InMemoryPlanningAssignmentUnitOfWork({
    packages: [createPlanningPackage()],
    vehicles: [createPlanningVehicle({ id: 'new-vehicle' })],
    couriers: [createPlanningCourier({ id: 'new-courier' })],
    depot: createPlanningDepot(),
    activeAssignmentPackageIds: new Set(),
    ...overrides,
  });
  return {
    uow,
    service: new PlanAndAssignRoutesService(
      uow,
      new ClusterPackagesService(),
      new OrderRouteStopsService(new NearestNeighborOrdering()),
    ),
    context: createPlanningExecutionContext(),
    command: createPlanAndAssignCommand({
      packageIds: ['pkg-001'],
      resourceSelection: 'AUTOMATIC',
      vehicleIds: [],
      courierIds: [],
    }),
  };
}

describe('PlanAndAssignRoutesService', () => {
  describe('automatic resource selection', () => {
    it('assigns a new active courier and vehicle without manually selected IDs or shifts', async () => {
      const { service, context, command } = createTestContext();

      const result = await service.execute(context, command);

      expect(result.routes).toHaveLength(1);
      expect(result.routes[0]).toMatchObject({
        vehicleId: 'new-vehicle',
        courierId: 'new-courier',
      });
      expect(result.outcomes[0].kind).toBe('ASSIGNED');
    });

    it('selects a free pair while excluding inactive and occupied resources', async () => {
      const { service, context, command } = createTestContext({
        vehicles: [
          createPlanningVehicle({ id: 'a-inactive', isActive: false }),
          createPlanningVehicle({ id: 'b-occupied', isOccupiedInWindow: true }),
          createPlanningVehicle({ id: 'c-free' }),
        ],
        couriers: [
          createPlanningCourier({ id: 'a-inactive', isActive: false }),
          createPlanningCourier({ id: 'b-occupied', isOccupiedInWindow: true }),
          createPlanningCourier({ id: 'c-free' }),
        ],
      });

      const result = await service.execute(context, command);

      expect(result.routes[0]).toMatchObject({
        vehicleId: 'c-free',
        courierId: 'c-free',
      });
    });

    it.each([
      ['no vehicles', { vehicles: [] }, 'NO_VEHICLE_AVAILABLE'],
      [
        'occupied vehicles',
        { vehicles: [createPlanningVehicle({ isOccupiedInWindow: true })] },
        'NO_VEHICLE_AVAILABLE',
      ],
      ['no couriers', { couriers: [] }, 'NO_COURIER_AVAILABLE'],
      [
        'occupied couriers',
        { couriers: [createPlanningCourier({ isOccupiedInWindow: true })] },
        'NO_COURIER_AVAILABLE',
      ],
      [
        'exhausted weight',
        {
          vehicles: [
            createPlanningVehicle({ activeAssignedWeightGrams: 100000 }),
          ],
        },
        'NO_CAPACITY',
      ],
      [
        'exhausted volume',
        {
          vehicles: [
            createPlanningVehicle({ activeAssignedVolumeCm3: 500000 }),
          ],
        },
        'NO_CAPACITY',
      ],
    ] as const)(
      'persists a pending result with a reason for %s',
      async (_, overrides, reasonCode) => {
        const { service, context, command, uow } = createTestContext(overrides);

        const result = await service.execute(context, command);

        expect(result.routes).toEqual([]);
        expect(result.outcomes[0]).toMatchObject({
          kind: 'PENDING_ASSIGNMENT',
          reasonCode,
        });
        expect(uow.packageUpdates[0].toState).toBe('PENDING_ASSIGNMENT');
      },
    );

    it('rejects resources from another tenant before assigning packages', async () => {
      const { service, context, command, uow } = createTestContext({
        couriers: [createPlanningCourier({ tenantId: ALT_TENANT_ID })],
      });

      await expect(service.execute(context, command)).rejects.toThrow();

      expect(uow.assignments).toEqual([]);
    });
  });
});
