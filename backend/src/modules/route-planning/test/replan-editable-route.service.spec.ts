import { NearestNeighborOrdering } from '../domain/algorithms/nearest-neighbor-ordering';
import { OrderRouteStopsService } from '../application/order-route-stops.service';
import { ReplanEditableRouteService } from '../application/replan-editable-route.service';
import type {
  EditableRouteReplanSession,
  EditableRouteReplanUnitOfWork,
  EditableRouteSnapshot,
} from '../application/ports/replan-editable-route.contract';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const ZONE_A = '20000000-0000-4000-8000-000000000001';
const DEPOT_A = '30000000-0000-4000-8000-000000000001';
const DATASET_A = '40000000-0000-4000-8000-000000000001';
const VEHICLE_1 = '50000000-0000-4000-8000-000000000001';
const COURIER_1 = '60000000-0000-4000-8000-000000000001';
const ROUTE_1 = '70000000-0000-4000-8000-000000000001';
const PKG_EXISTING = '80000000-0000-4000-8000-000000000001';
const PKG_PENDING = '80000000-0000-4000-8000-000000000002';

function createBaseSnapshot(
  overrides: Partial<EditableRouteSnapshot> = {},
): EditableRouteSnapshot {
  return {
    id: ROUTE_1,
    tenantId: TENANT_A,
    state: 'PLANNED',
    vehicleId: VEHICLE_1,
    courierId: COURIER_1,
    datasetId: DATASET_A,
    depot: {
      id: DEPOT_A,
      tenantId: TENANT_A,
      latitude: 10.9878,
      longitude: -74.7889,
    },
    existingStops: [
      {
        routeStopId: '90000000-0000-4000-8000-000000000001',
        packageId: PKG_EXISTING,
        sequence: 1,
        latitude: 11.01,
        longitude: -74.82,
      },
    ],
    vehicle: {
      id: VEHICLE_1,
      tenantId: TENANT_A,
      maxWeightGrams: 100000,
      maxVolumeCm3: 1000000,
      activeAssignedWeightGrams: 5000,
      activeAssignedVolumeCm3: 20000,
      isActive: true,
      isOccupiedInWindow: false,
    },
    courier: {
      id: COURIER_1,
      tenantId: TENANT_A,
      isActive: true,
      isOccupiedInWindow: false,
    },
    packages: [
      {
        id: PKG_PENDING,
        tenantId: TENANT_A,
        state: 'PENDING_ASSIGNMENT',
        zoneId: ZONE_A,
        addressId: '91000000-0000-4000-8000-000000000002',
        weightGrams: 4000,
        volumeCm3: 15000,
        geocodingCandidate: {
          candidateId: '92000000-0000-4000-8000-000000000002',
          latitude: 10.992,
          longitude: -74.795,
          datasetId: DATASET_A,
          datasetStatus: 'READY',
          status: 'MATCHED',
        },
        networkAttachment: {
          status: 'AUTO_ACCEPTED',
          roadNodeId: '93000000-0000-4000-8000-000000000002',
          roadEdgeId: null,
        },
      },
    ],
    activeAssignmentPackageIds: new Set<string>(),
    ...overrides,
  };
}

describe('ReplanEditableRouteService', () => {
  const context = {
    tenantId: TENANT_A,
    actorUserId: 'user-coordinator-1',
    correlationId: 'corr-replan-1',
  };

  it('assigns a PENDING_ASSIGNMENT package to an editable PLANNED route and reorders stop sequences 1..N from the depot', async () => {
    const session: jest.Mocked<EditableRouteReplanSession> = {
      loadEditableRouteSnapshot: jest
        .fn()
        .mockResolvedValue(createBaseSnapshot()),
      updateStopSequences: jest.fn().mockResolvedValue(undefined),
      createRouteStops: jest.fn().mockResolvedValue(undefined),
      createAssignments: jest.fn().mockResolvedValue(undefined),
      updatePackageStates: jest.fn().mockResolvedValue(undefined),
      saveOutboxEvents: jest.fn().mockResolvedValue(undefined),
    };

    const uow: EditableRouteReplanUnitOfWork = {
      run: jest.fn(async (_ctx, op) => op(session)),
    };

    const service = new ReplanEditableRouteService(
      uow,
      new OrderRouteStopsService(new NearestNeighborOrdering()),
    );

    const result = await service.execute(context, {
      routeId: ROUTE_1,
      packageIds: [PKG_PENDING],
    });

    expect(result.routeId).toBe(ROUTE_1);
    expect(result.state).toBe('PLANNED');
    expect(result.stops).toHaveLength(2);
    // PKG_PENDING (10.992, -74.795) is closer to depot (10.9878, -74.7889) than PKG_EXISTING (11.01, -74.82)
    expect(result.stops[0]?.packageId).toBe(PKG_PENDING);
    expect(result.stops[0]?.sequence).toBe(1);
    expect(result.stops[1]?.packageId).toBe(PKG_EXISTING);
    expect(result.stops[1]?.sequence).toBe(2);

    expect(session.updateStopSequences).toHaveBeenCalledWith(
      ROUTE_1,
      [
        {
          routeStopId: '90000000-0000-4000-8000-000000000001',
          sequence: 2,
        },
      ],
      expect.any(Number),
    );
    expect(session.createRouteStops).toHaveBeenCalledTimes(1);
    expect(session.createAssignments).toHaveBeenCalledTimes(1);
    expect(session.updatePackageStates).toHaveBeenCalledWith([
      expect.objectContaining({
        packageId: PKG_PENDING,
        fromState: 'PENDING_ASSIGNMENT',
        toState: 'ASSIGNED_TO_ROUTE',
      }),
    ]);
  });

  it('rejects with ROUTE_NOT_EDITABLE when route is READY or already in execution', async () => {
    const session: jest.Mocked<EditableRouteReplanSession> = {
      loadEditableRouteSnapshot: jest
        .fn()
        .mockResolvedValue(createBaseSnapshot({ state: 'READY' })),
      updateStopSequences: jest.fn(),
      createRouteStops: jest.fn(),
      createAssignments: jest.fn(),
      updatePackageStates: jest.fn(),
      saveOutboxEvents: jest.fn(),
    };

    const uow: EditableRouteReplanUnitOfWork = {
      run: jest.fn(async (_ctx, op) => op(session)),
    };

    const service = new ReplanEditableRouteService(
      uow,
      new OrderRouteStopsService(new NearestNeighborOrdering()),
    );

    await expect(
      service.execute(context, {
        routeId: ROUTE_1,
        packageIds: [PKG_PENDING],
      }),
    ).rejects.toThrow('ROUTE_NOT_EDITABLE');
  });
});
