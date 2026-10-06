import { PlanAndAssignRoutesService } from '../application/plan-and-assign-routes.service';
import { ClusterPackagesService } from '../application/cluster-packages.service';
import { OrderRouteStopsService } from '../application/order-route-stops.service';
import { NearestNeighborOrdering } from '../domain/algorithms/nearest-neighbor-ordering';
import { PlanAndAssignRoutesResult } from '../application/ports/plan-and-assign-routes.contract';
import {
    DEFAULT_TENANT_ID,
    ALT_TENANT_ID,
    DEFAULT_DEPOT_ID,
    DEFAULT_ZONE_ID,
    DEFAULT_DATASET_ID,
    createPlanningExecutionContext,
    createPlanAndAssignCommand,
    createPlanningPackage,
    createPlanningVehicle,
    createPlanningCourier,
    createPlanningDepot,
    InMemoryPlanningAssignmentUnitOfWork,
} from './fixtures/assignment-planning.fixtures';


describe('PlanAndAssignRoutesService (ASSIGN-01)', () => {
    let clusterService: ClusterPackagesService;
    let orderStopsService: OrderRouteStopsService;

    beforeEach(() => {
        clusterService = new ClusterPackagesService();
        orderStopsService = new OrderRouteStopsService(new NearestNeighborOrdering());
    });

    it('CA-02: plans routes and creates assignments for eligible packages', async () => {
        const pkg1 = createPlanningPackage({ id: 'pkg-001' });
        const pkg2 = createPlanningPackage({ id: 'pkg-002' });
        const vehicle = createPlanningVehicle({ id: 'veh-001' });
        const courier = createPlanningCourier({ id: 'cour-001' });
        const depot = createPlanningDepot();

        const uow = new InMemoryPlanningAssignmentUnitOfWork({
            packages: [pkg1, pkg2],
            vehicles: [vehicle],
            couriers: [courier],
            depot,
            activeAssignmentPackageIds: new Set(),
        });

        const service = new PlanAndAssignRoutesService(
            uow,
            clusterService,
            orderStopsService,
        );

        const context = createPlanningExecutionContext();
        const command = createPlanAndAssignCommand({
            packageIds: ['pkg-001', 'pkg-002'],
        });

        const result = await service.execute(context, command);

        expect(result.status).toBe('COMPLETED');
        expect(result.replayed).toBe(false);
        expect(result.routes).toHaveLength(1);
        expect(result.routes[0].stops).toHaveLength(2);
        expect(result.routes[0].stops[0].sequence).toBe(1);
        expect(result.routes[0].stops[1].sequence).toBe(2);
        expect(result.outcomes).toHaveLength(2);
        expect(result.outcomes.every((o) => o.kind === 'ASSIGNED')).toBe(true);

        expect(uow.routes).toHaveLength(1);
        expect(uow.stops).toHaveLength(2);
        expect(uow.assignments).toHaveLength(2);
        expect(uow.packageUpdates).toHaveLength(2);
        expect(uow.outboxEvents).toHaveLength(2);
    });

    it('CA-05: marks packages as PENDING_ASSIGNMENT with NO_VEHICLE_AVAILABLE when no fleet available', async () => {
        const pkg1 = createPlanningPackage({ id: 'pkg-001' });
        const depot = createPlanningDepot();

        const uow = new InMemoryPlanningAssignmentUnitOfWork({
            packages: [pkg1],
            vehicles: [],
            couriers: [],
            depot,
            activeAssignmentPackageIds: new Set(),
        });

        const service = new PlanAndAssignRoutesService(
            uow,
            clusterService,
            orderStopsService,
        );

        const context = createPlanningExecutionContext();
        const command = createPlanAndAssignCommand({
            packageIds: ['pkg-001'],
            vehicleIds: [],
            courierIds: [],
        });

        const result = await service.execute(context, command);

        expect(result.status).toBe('COMPLETED');
        expect(result.routes).toHaveLength(0);
        expect(result.outcomes).toHaveLength(1);
        expect(result.outcomes[0].kind).toBe('PENDING_ASSIGNMENT');
        if (result.outcomes[0].kind === 'PENDING_ASSIGNMENT') {
            expect(result.outcomes[0].reasonCode).toBe('NO_VEHICLE_AVAILABLE');
        }
        expect(uow.routes).toHaveLength(0);
        expect(uow.assignments).toHaveLength(0);
        expect(uow.packageUpdates).toHaveLength(1);
        expect(uow.packageUpdates[0].toState).toBe('PENDING_ASSIGNMENT');
    });

    it('CA-01: rejects request when package belongs to another tenant', async () => {
        const pkgAlt = createPlanningPackage({
            id: 'pkg-alt',
            tenantId: ALT_TENANT_ID,
        });
        const vehicle = createPlanningVehicle();
        const courier = createPlanningCourier();
        const depot = createPlanningDepot();

        const uow = new InMemoryPlanningAssignmentUnitOfWork({
            packages: [pkgAlt],
            vehicles: [vehicle],
            couriers: [courier],
            depot,
            activeAssignmentPackageIds: new Set(),
        });

        const service = new PlanAndAssignRoutesService(
            uow,
            clusterService,
            orderStopsService,
        );

        const context = createPlanningExecutionContext({ tenantId: DEFAULT_TENANT_ID });
        const command = createPlanAndAssignCommand({ packageIds: ['pkg-alt'] });

        await expect(service.execute(context, command)).rejects.toThrow();
        expect(uow.routes).toHaveLength(0);
        expect(uow.assignments).toHaveLength(0);
        expect(uow.packageUpdates).toHaveLength(0);
    });

    it('CA-04: rolls back completely if an error occurs during persistence', async () => {
        const pkg1 = createPlanningPackage({ id: 'pkg-001' });
        const vehicle = createPlanningVehicle();
        const courier = createPlanningCourier();
        const depot = createPlanningDepot();

        const uow = new InMemoryPlanningAssignmentUnitOfWork({
            packages: [pkg1],
            vehicles: [vehicle],
            couriers: [courier],
            depot,
            activeAssignmentPackageIds: new Set(),
        });

        uow.failurePoint = 'createAssignments';

        const service = new PlanAndAssignRoutesService(
            uow,
            clusterService,
            orderStopsService,
        );

        const context = createPlanningExecutionContext();
        const command = createPlanAndAssignCommand({ packageIds: ['pkg-001'] });

        await expect(service.execute(context, command)).rejects.toThrow(
            'Induced failure in createAssignments',
        );

        expect(uow.routes).toHaveLength(0);
        expect(uow.stops).toHaveLength(0);
        expect(uow.assignments).toHaveLength(0);
        expect(uow.packageUpdates).toHaveLength(0);
    });

    it('CA-08: returns existing result on replay without creating duplicate entities', async () => {
        const pkg1 = createPlanningPackage({ id: 'pkg-001' });
        const vehicle = createPlanningVehicle();
        const courier = createPlanningCourier();
        const depot = createPlanningDepot();

        const uow = new InMemoryPlanningAssignmentUnitOfWork({
            packages: [pkg1],
            vehicles: [vehicle],
            couriers: [courier],
            depot,
            activeAssignmentPackageIds: new Set(),
        });

        const previousResult: PlanAndAssignRoutesResult = {
            requestId: 'req-001',
            tenantId: DEFAULT_TENANT_ID,
            status: 'COMPLETED',
            replayed: false,
            routes: [],
            outcomes: [],
        };
        uow.completedRequests.set('req-001', previousResult);

        const service = new PlanAndAssignRoutesService(
            uow,
            clusterService,
            orderStopsService,
        );

        const context = createPlanningExecutionContext();
        const command = createPlanAndAssignCommand({ requestId: 'req-001' });

        const result = await service.execute(context, command);

        expect(result.status).toBe('COMPLETED');
        expect(result.replayed).toBe(true);
        expect(uow.routes).toHaveLength(0);
        expect(uow.assignments).toHaveLength(0);
    });
});