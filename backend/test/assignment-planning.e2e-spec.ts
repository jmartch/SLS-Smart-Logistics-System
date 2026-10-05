import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import {
    AssignmentStatus,
    PackageState,
    PlanningPackageOutcome,
    PrismaClient,
    RoutePlanningRequestStatus,
    RouteState,
    RouteStopState,
} from '../generated/prisma/client';
import { PrismaService } from '../src/database/prisma.service';
import { runWithTenant } from '../src/database/run-with-tenant';
import { ClusterPackagesService } from '../src/modules/route-planning/application/cluster-packages.service';
import { OrderRouteStopsService } from '../src/modules/route-planning/application/order-route-stops.service';
import { PlanAndAssignRoutesService } from '../src/modules/route-planning/application/plan-and-assign-routes.service';
import { NearestNeighborOrdering } from '../src/modules/route-planning/domain/algorithms/nearest-neighbor-ordering';
import { PrismaPlanningAssignmentUnitOfWork } from '../src/modules/route-planning/infrastructure/prisma-planning-assignment-unit-of-work';
import type {
    PlanAndAssignRoutesCommand,
    PlanningExecutionContext,
} from '../src/modules/route-planning/application/ports/plan-and-assign-routes.contract';

describe('Transactional Route Planning and Assignment (ASSIGN-01)', () => {
    const admin = new PrismaClient({
        adapter: new PrismaPg({
            connectionString: process.env.DATABASE_URL,
        }),
    });
    const app = new PrismaService();

    const uow = new PrismaPlanningAssignmentUnitOfWork(app);
    const clusterService = new ClusterPackagesService();
    const orderStopsService = new OrderRouteStopsService(new NearestNeighborOrdering());
    const service = new PlanAndAssignRoutesService(
        uow,
        clusterService,
        orderStopsService,
    );

    const tenantAId = randomUUID();
    const tenantBId = randomUUID();
    const userAId = randomUUID();
    const userA2Id = randomUUID();
    const zoneAId = randomUUID();
    const sectorAId = randomUUID();
    const shipmentTypeAId = randomUUID();
    const shipmentTypeBId = randomUUID();
    const datasetAId = randomUUID();
    const depotAId = randomUUID();
    const vehicle1Id = randomUUID();
    const vehicle2Id = randomUUID();
    const courier1Id = randomUUID();
    const courier2Id = randomUUID();

    const address1Id = randomUUID();
    const address2Id = randomUUID();
    const addressBId = randomUUID();
    const attempt1Id = randomUUID();
    const attempt2Id = randomUUID();
    const candidate1Id = randomUUID();
    const candidate2Id = randomUUID();

    const pkg1Id = randomUUID();
    const pkg2Id = randomUUID();
    const pkgForeignId = randomUUID();
    const pkgNoCoordsId = randomUUID();

    const horizonStart = '2026-10-10T08:00:00.000Z';
    const horizonEnd = '2026-10-10T18:00:00.000Z';

    const contextA: PlanningExecutionContext = {
        tenantId: tenantAId,
        actorUserId: userAId,
        correlationId: randomUUID(),
    };

    beforeAll(async () => {
        for (const variable of ['DATABASE_URL', 'RUNTIME_DATABASE_URL'] as const) {
            const connectionString = process.env[variable];
            if (!connectionString) {
                throw new Error(`${variable} is required`);
            }
            const databasePath = new URL(connectionString).pathname;
            if (!/^\/sls_assign01_[0-9a-f]{32}$/.test(databasePath)) {
                throw new Error(
                    `${variable} must point to a disposable sls_assign01_* database`,
                );
            }
        }

        await admin.$connect();
        await app.$connect();

        await admin.tenant.createMany({
            data: [
                { id: tenantAId, name: `Tenant A ${tenantAId}`, status: 'ACTIVE' },
                { id: tenantBId, name: `Tenant B ${tenantBId}`, status: 'ACTIVE' },
            ],
        });

        await admin.user.createMany({
            data: [
                {
                    id: userAId,
                    tenantId: tenantAId,
                    email: `coordinator-${userAId}@example.test`,
                    passwordHash: 'hashed-password',
                    status: 'ACTIVE',
                },
                {
                    id: userA2Id,
                    tenantId: tenantAId,
                    email: `courier-${userA2Id}@example.test`,
                    passwordHash: 'hashed-password',
                    status: 'ACTIVE',
                },
            ],
        });

        await admin.zone.create({
            data: {
                id: zoneAId,
                tenantId: tenantAId,
                code: `Z${zoneAId.slice(0, 6)}`,
                name: 'Zona Norte',
            },
        });

        await admin.sector.create({
            data: {
                id: sectorAId,
                tenantId: tenantAId,
                zoneId: zoneAId,
                code: `S${sectorAId.slice(0, 6)}`,
                name: 'Sector Centro',
            },
        });

        await admin.shipmentType.createMany({
            data: [
                {
                    id: shipmentTypeAId,
                    tenantId: tenantAId,
                    code: `ST${shipmentTypeAId.slice(0, 5)}`,
                    name: 'Estándar A',
                },
                {
                    id: shipmentTypeBId,
                    tenantId: tenantBId,
                    code: `STB${shipmentTypeBId.slice(0, 4)}`,
                    name: 'Estándar B',
                },
            ],
        });

        await admin.geoDataset.create({
            data: {
                id: datasetAId,
                name: 'Dataset Barranquilla',
                sourceType: 'SYNTHETIC',
                sourceReference: 'assign-01-fixture',
                sourceDate: new Date(),
                checksum: randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', ''),
                license: 'MIT',
                coverage: 'Barranquilla',
                importerVersion: '1.0',
                status: 'READY',
            },
        });

        await admin.$executeRaw`
            INSERT INTO "Depot" ("id", "tenantId", "name", "location", "timeZone", "openingHours")
            VALUES (
                ${depotAId}::uuid,
                ${tenantAId}::uuid,
                'Depósito Central',
                ST_SetSRID(ST_MakePoint(-74.8000, 11.0000), 4326),
                'America/Bogota',
                '{}'::jsonb
            )
        `;

        await admin.vehicle.createMany({
            data: [
                {
                    id: vehicle1Id,
                    tenantId: tenantAId,
                    plate: `VEH${vehicle1Id.slice(0, 4)}`,
                    maxWeightKg: 20,
                    maxVolumeM3: 1,
                    status: 'ACTIVE',
                },
                {
                    id: vehicle2Id,
                    tenantId: tenantAId,
                    plate: `VEH${vehicle2Id.slice(0, 4)}`,
                    maxWeightKg: 20,
                    maxVolumeM3: 1,
                    status: 'ACTIVE',
                },
            ],
        });

        await admin.vehicleShift.createMany({
            data: [
                {
                    tenantId: tenantAId,
                    vehicleId: vehicle1Id,
                    startAt: new Date('2026-10-10T07:00:00.000Z'),
                    endAt: new Date('2026-10-10T19:00:00.000Z'),
                },
                {
                    tenantId: tenantAId,
                    vehicleId: vehicle2Id,
                    startAt: new Date('2026-10-10T07:00:00.000Z'),
                    endAt: new Date('2026-10-10T19:00:00.000Z'),
                },
            ],
        });

        await admin.courier.createMany({
            data: [
                {
                    id: courier1Id,
                    tenantId: tenantAId,
                    userId: userAId,
                    status: 'ACTIVE',
                },
                {
                    id: courier2Id,
                    tenantId: tenantAId,
                    userId: userA2Id,
                    status: 'ACTIVE',
                },
            ],
        });

        await admin.courierShift.createMany({
            data: [
                {
                    tenantId: tenantAId,
                    courierId: courier1Id,
                    startAt: new Date('2026-10-10T07:00:00.000Z'),
                    endAt: new Date('2026-10-10T19:00:00.000Z'),
                },
                {
                    tenantId: tenantAId,
                    courierId: courier2Id,
                    startAt: new Date('2026-10-10T07:00:00.000Z'),
                    endAt: new Date('2026-10-10T19:00:00.000Z'),
                },
            ],
        });

        await admin.address.createMany({
            data: [
                {
                    id: address1Id,
                    tenantId: tenantAId,
                    originalText: 'Calle 72 # 54-10',
                    municipalityCode: '08001',
                },
                {
                    id: address2Id,
                    tenantId: tenantAId,
                    originalText: 'Calle 76 # 54-20',
                    municipalityCode: '08001',
                },
                {
                    id: addressBId,
                    tenantId: tenantBId,
                    originalText: 'Calle 80 # 50-10',
                    municipalityCode: '08001',
                },
            ],
        });

        await admin.geocodingAttempt.createMany({
            data: [
                {
                    id: attempt1Id,
                    tenantId: tenantAId,
                    addressId: address1Id,
                    datasetId: datasetAId,
                    status: 'MATCHED',
                    normalizedText: 'Calle 72 # 54-10',
                    components: {},
                    algorithmVersion: '1.0',
                },
                {
                    id: attempt2Id,
                    tenantId: tenantAId,
                    addressId: address2Id,
                    datasetId: datasetAId,
                    status: 'MATCHED',
                    normalizedText: 'Calle 76 # 54-20',
                    components: {},
                    algorithmVersion: '1.0',
                },
            ],
        });

        await admin.$executeRaw`
            INSERT INTO "GeocodingCandidate" (
                "id", "tenantId", "attemptId", "datasetId", "rank", "score", "scoreBreakdown", "source", "precision", "location"
            ) VALUES
            (
                ${candidate1Id}::uuid,
                ${tenantAId}::uuid,
                ${attempt1Id}::uuid,
                ${datasetAId}::uuid,
                1,
                1.0000,
                '{}'::jsonb,
                'SYNTHETIC',
                'ENTRANCE',
                ST_SetSRID(ST_MakePoint(-74.8010, 11.0010), 4326)
            ),
            (
                ${candidate2Id}::uuid,
                ${tenantAId}::uuid,
                ${attempt2Id}::uuid,
                ${datasetAId}::uuid,
                1,
                1.0000,
                '{}'::jsonb,
                'SYNTHETIC',
                'ENTRANCE',
                ST_SetSRID(ST_MakePoint(-74.8020, 11.0020), 4326)
            )
        `;

        await admin.geocodingAttempt.update({
            where: { id: attempt1Id },
            data: { selectedCandidateId: candidate1Id },
        });

        await admin.geocodingAttempt.update({
            where: { id: attempt2Id },
            data: { selectedCandidateId: candidate2Id },
        });

        const node1Id = randomUUID();
        const node2Id = randomUUID();

        await admin.$executeRaw`
            INSERT INTO "RoadNode" ("id", "datasetId", "location")
            VALUES
            (
                ${node1Id}::uuid,
                ${datasetAId}::uuid,
                ST_SetSRID(ST_MakePoint(-74.8010, 11.0010), 4326)
            ),
            (
                ${node2Id}::uuid,
                ${datasetAId}::uuid,
                ST_SetSRID(ST_MakePoint(-74.8020, 11.0020), 4326)
            )
        `;

        await admin.$executeRaw`
            INSERT INTO "NetworkAttachment" (
                "id",
                "tenantId",
                "datasetId",
                "geocodingCandidateId",
                "profile",
                "roadNodeId",
                "roadEdgeId",
                "snappedLocation",
                "accessDistanceM",
                "status"
            ) VALUES
            (
                gen_random_uuid(),
                ${tenantAId}::uuid,
                ${datasetAId}::uuid,
                ${candidate1Id}::uuid,
                'MOTOR_VEHICLE',
                ${node1Id}::uuid,
                NULL,
                ST_SetSRID(ST_MakePoint(-74.8010, 11.0010), 4326),
                0,
                'AUTO_ACCEPTED'
            ),
            (
                gen_random_uuid(),
                ${tenantAId}::uuid,
                ${datasetAId}::uuid,
                ${candidate2Id}::uuid,
                'MOTOR_VEHICLE',
                ${node2Id}::uuid,
                NULL,
                ST_SetSRID(ST_MakePoint(-74.8020, 11.0020), 4326),
                0,
                'AUTO_ACCEPTED'
            )
        `;

        await admin.package.createMany({
            data: [
                {
                    id: pkg1Id,
                    tenantId: tenantAId,
                    zoneId: zoneAId,
                    sectorId: sectorAId,
                    shipmentTypeId: shipmentTypeAId,
                    addressId: address1Id,
                    geocodingAttemptId: attempt1Id,
                    trackingCode: `TRK-${pkg1Id.slice(0, 8)}`,
                    publicTrackingToken: `TOK-${pkg1Id.slice(0, 8)}`,
                    state: 'CLASSIFIED',
                    weightKg: 2.5,
                    volumeM3: 0.015,
                    lengthCm: 30,
                    widthCm: 25,
                    heightCm: 20,
                },
                {
                    id: pkg2Id,
                    tenantId: tenantAId,
                    zoneId: zoneAId,
                    sectorId: sectorAId,
                    shipmentTypeId: shipmentTypeAId,
                    addressId: address2Id,
                    geocodingAttemptId: attempt2Id,
                    trackingCode: `TRK-${pkg2Id.slice(0, 8)}`,
                    publicTrackingToken: `TOK-${pkg2Id.slice(0, 8)}`,
                    state: 'CLASSIFIED',
                    weightKg: 3.0,
                    volumeM3: 0.02,
                    lengthCm: 40,
                    widthCm: 25,
                    heightCm: 20,
                },
                {
                    id: pkgNoCoordsId,
                    tenantId: tenantAId,
                    zoneId: zoneAId,
                    sectorId: sectorAId,
                    shipmentTypeId: shipmentTypeAId,
                    addressId: address1Id,
                    geocodingAttemptId: null,
                    trackingCode: `TRK-${pkgNoCoordsId.slice(0, 8)}`,
                    publicTrackingToken: `TOK-${pkgNoCoordsId.slice(0, 8)}`,
                    state: 'CLASSIFIED',
                    weightKg: 1.0,
                    volumeM3: 0.005,
                    lengthCm: 20,
                    widthCm: 25,
                    heightCm: 10,
                },
                {
                    id: pkgForeignId,
                    tenantId: tenantBId,
                    addressId: addressBId,
                    shipmentTypeId: shipmentTypeBId,
                    trackingCode: `TRK-${pkgForeignId.slice(0, 8)}`,
                    publicTrackingToken: `TOK-${pkgForeignId.slice(0, 8)}`,
                    state: 'CLASSIFIED',
                    weightKg: 2.0,
                    volumeM3: 0.01,
                    lengthCm: 25,
                    widthCm: 20,
                    heightCm: 20,
                },
            ],
        });
    });

    afterAll(async () => {
        await app.$disconnect();
        await admin.$disconnect();
    });

    it('enforces tenant isolation preventing assignment of foreign tenant packages (CA-01)', async () => {
        const command: PlanAndAssignRoutesCommand = {
            requestId: randomUUID(),
            zoneId: zoneAId,
            packageIds: [pkgForeignId],
            vehicleIds: [vehicle1Id],
            courierIds: [courier1Id],
            depotId: depotAId,
            datasetId: datasetAId,
            profile: 'MOTOR_VEHICLE',
            window: { startAt: horizonStart, endAt: horizonEnd },
            radiusMeters: 5000,
            ordering: 'nearest-neighbor',
        };

        await expect(service.execute(contextA, command)).rejects.toThrow();

        const foreignPkg = await runWithTenant(app, tenantAId, (tx) =>
            tx.package.findUnique({
                where: { id: pkgForeignId },
            }),
        );
        expect(foreignPkg).toBeNull();

        const foreignAssignments = await runWithTenant(app, tenantAId, (tx) =>
            tx.assignment.findMany({
                where: { packageId: pkgForeignId },
            }),
        );
        expect(foreignAssignments).toHaveLength(0);
    });

    it('plans and assigns valid packages atomically into a planned route (CA-02, CA-03, CA-04)', async () => {
        const requestId = randomUUID();
        const command: PlanAndAssignRoutesCommand = {
            requestId,
            zoneId: zoneAId,
            packageIds: [pkg1Id, pkg2Id],
            vehicleIds: [vehicle1Id],
            courierIds: [courier1Id],
            depotId: depotAId,
            datasetId: datasetAId,
            profile: 'MOTOR_VEHICLE',
            window: { startAt: horizonStart, endAt: horizonEnd },
            radiusMeters: 5000,
            ordering: 'nearest-neighbor',
        };

        const result = await service.execute(contextA, command);

        expect(result.status).toBe('COMPLETED');
        expect(result.replayed).toBe(false);
        expect(result.routes).toHaveLength(1);

        const routeResult = result.routes[0];
        expect(routeResult.vehicleId).toBe(vehicle1Id);
        expect(routeResult.courierId).toBe(courier1Id);
        expect(routeResult.stops).toHaveLength(2);
        expect(routeResult.stops[0].sequence).toBe(1);
        expect(routeResult.stops[1].sequence).toBe(2);
        expect(routeResult.totalDistanceMeters).toBeGreaterThan(0);

        expect(result.outcomes).toHaveLength(2);
        expect(result.outcomes.every((o) => o.kind === 'ASSIGNED')).toBe(true);

        const dbRoute = await admin.route.findUnique({
            where: { id: routeResult.routeId },
            include: { stops: { orderBy: { sequence: 'asc' } }, assignments: true },
        });
        expect(dbRoute).not.toBeNull();
        expect(dbRoute?.state).toBe(RouteState.PLANNED);
        expect(dbRoute?.stops).toHaveLength(2);
        expect(dbRoute?.stops[0].state).toBe(RouteStopState.PENDING);
        expect(dbRoute?.assignments).toHaveLength(2);
        expect(dbRoute?.assignments.every((a) => a.status === AssignmentStatus.ACTIVE)).toBe(true);

        const dbPkg1 = await admin.package.findUnique({ where: { id: pkg1Id } });
        const dbPkg2 = await admin.package.findUnique({ where: { id: pkg2Id } });
        expect(dbPkg1?.state).toBe(PackageState.ASSIGNED_TO_ROUTE);
        expect(dbPkg2?.state).toBe(PackageState.ASSIGNED_TO_ROUTE);

        const history1 = await admin.packageStatusHistory.findMany({
            where: { packageId: pkg1Id },
        });
        expect(history1).toHaveLength(1);
        expect(history1[0].fromState).toBe(PackageState.CLASSIFIED);
        expect(history1[0].toState).toBe(PackageState.ASSIGNED_TO_ROUTE);
        expect(history1[0].changedByUserId).toBe(userAId);

        const planResults = await admin.planningPackageResult.findMany({
            where: { planningRequestId: requestId },
        });
        expect(planResults).toHaveLength(2);
        expect(planResults.every((r) => r.outcome === PlanningPackageOutcome.ASSIGNED)).toBe(true);

        const outboxEvents = await admin.outboxEvent.findMany({
            where: { tenantId: tenantAId, eventType: 'PackageAssigned' },
        });
        expect(outboxEvents.length).toBeGreaterThanOrEqual(2);

        const planRequest = await admin.routePlanningRequest.findUnique({
            where: { id: requestId },
        });
        expect(planRequest?.status).toBe(RoutePlanningRequestStatus.COMPLETED);
    });

    it('records partial rejections as PENDING_ASSIGNMENT via domain State (CA-05)', async () => {
        const requestId = randomUUID();
        const command: PlanAndAssignRoutesCommand = {
            requestId,
            zoneId: zoneAId,
            packageIds: [pkgNoCoordsId],
            vehicleIds: [vehicle1Id],
            courierIds: [courier1Id],
            depotId: depotAId,
            datasetId: datasetAId,
            profile: 'MOTOR_VEHICLE',
            window: { startAt: horizonStart, endAt: horizonEnd },
            radiusMeters: 5000,
            ordering: 'nearest-neighbor',
        };

        const result = await service.execute(contextA, command);

        expect(result.routes).toHaveLength(0);
        expect(result.outcomes).toHaveLength(1);
        const outcome = result.outcomes[0];
        expect(outcome.kind).toBe('PENDING_ASSIGNMENT');
        if (outcome.kind === 'PENDING_ASSIGNMENT') {
            expect(outcome.reasonCode).toBe('GEOCODING_NOT_READY');
        }

        const dbPkg = await admin.package.findUnique({ where: { id: pkgNoCoordsId } });
        expect(dbPkg?.state).toBe(PackageState.PENDING_ASSIGNMENT);

        const history = await admin.packageStatusHistory.findMany({
            where: { packageId: pkgNoCoordsId },
        });
        expect(history).toHaveLength(1);
        expect(history[0].fromState).toBe(PackageState.CLASSIFIED);
        expect(history[0].toState).toBe(PackageState.PENDING_ASSIGNMENT);

        const pr = await admin.planningPackageResult.findFirst({
            where: { planningRequestId: requestId, packageId: pkgNoCoordsId },
        });
        expect(pr?.outcome).toBe(PlanningPackageOutcome.PENDING);
        expect(pr?.reasonCode).toBe('GEOCODING_NOT_READY');
    });

    it('safely replays completed planning requests idempotently (CA-08)', async () => {
        const requestId = randomUUID();
        const pkgReplay1 = randomUUID();
        const pkgReplay2 = randomUUID();

        await admin.package.createMany({
            data: [
                {
                    id: pkgReplay1,
                    tenantId: tenantAId,
                    zoneId: zoneAId,
                    sectorId: sectorAId,
                    shipmentTypeId: shipmentTypeAId,
                    addressId: address1Id,
                    geocodingAttemptId: attempt1Id,
                    trackingCode: `TRK-${pkgReplay1.slice(0, 8)}`,
                    publicTrackingToken: `TOK-${pkgReplay1.slice(0, 8)}`,
                    state: 'CLASSIFIED',
                    weightKg: 1.0,
                    volumeM3: 0.005,
                    lengthCm: 20,
                    widthCm: 25,
                    heightCm: 10,
                },
                {
                    id: pkgReplay2,
                    tenantId: tenantAId,
                    zoneId: zoneAId,
                    sectorId: sectorAId,
                    shipmentTypeId: shipmentTypeAId,
                    addressId: address2Id,
                    geocodingAttemptId: attempt2Id,
                    trackingCode: `TRK-${pkgReplay2.slice(0, 8)}`,
                    publicTrackingToken: `TOK-${pkgReplay2.slice(0, 8)}`,
                    state: 'CLASSIFIED',
                    weightKg: 1.5,
                    volumeM3: 0.008,
                    lengthCm: 25,
                    widthCm: 20,
                    heightCm: 16,
                },
            ],
        });

        const command: PlanAndAssignRoutesCommand = {
            requestId,
            zoneId: zoneAId,
            packageIds: [pkgReplay1, pkgReplay2],
            vehicleIds: [vehicle2Id],
            courierIds: [courier2Id],
            depotId: depotAId,
            datasetId: datasetAId,
            profile: 'MOTOR_VEHICLE',
            window: { startAt: horizonStart, endAt: horizonEnd },
            radiusMeters: 5000,
            ordering: 'nearest-neighbor',
        };

        const firstResult = await service.execute(contextA, command);
        expect(firstResult.status).toBe('COMPLETED');
        expect(firstResult.replayed).toBe(false);

        const routeCountBefore = await admin.route.count({
            where: { planningRequestId: requestId },
        });
        const assignmentCountBefore = await admin.assignment.count({
            where: { route: { planningRequestId: requestId } },
        });

        const secondResult = await service.execute(contextA, command);
        expect(secondResult.status).toBe('COMPLETED');
        expect(secondResult.replayed).toBe(true);
        expect(secondResult.routes).toHaveLength(firstResult.routes.length);
        expect(secondResult.routes[0].routeId).toBe(firstResult.routes[0].routeId);

        const routeCountAfter = await admin.route.count({
            where: { planningRequestId: requestId },
        });
        const assignmentCountAfter = await admin.assignment.count({
            where: { route: { planningRequestId: requestId } },
        });

        expect(routeCountAfter).toBe(routeCountBefore);
        expect(assignmentCountAfter).toBe(assignmentCountBefore);
    });

    it('rejects replaying a request with conflicting parameters (CA-08)', async () => {
        const requestId = randomUUID();
        const pkgConflictId = randomUUID();

        await admin.package.create({
            data: {
                id: pkgConflictId,
                tenantId: tenantAId,
                zoneId: zoneAId,
                sectorId: sectorAId,
                shipmentTypeId: shipmentTypeAId,
                addressId: address1Id,
                geocodingAttemptId: attempt1Id,
                trackingCode: `TRK-${pkgConflictId.slice(0, 8)}`,
                publicTrackingToken: `TOK-${pkgConflictId.slice(0, 8)}`,
                state: 'CLASSIFIED',
                weightKg: 1.0,
                volumeM3: 0.005,
                lengthCm: 20,
                widthCm: 25,
                heightCm: 10,
            },
        });

        const commandOriginal: PlanAndAssignRoutesCommand = {
            requestId,
            zoneId: zoneAId,
            packageIds: [pkgConflictId],
            vehicleIds: [vehicle1Id],
            courierIds: [courier1Id],
            depotId: depotAId,
            datasetId: datasetAId,
            profile: 'MOTOR_VEHICLE',
            window: { startAt: horizonStart, endAt: horizonEnd },
            radiusMeters: 5000,
            ordering: 'nearest-neighbor',
        };

        await service.execute(contextA, commandOriginal);

        const commandAltered: PlanAndAssignRoutesCommand = {
            ...commandOriginal,
            radiusMeters: 10000,
        };

        await expect(service.execute(contextA, commandAltered)).rejects.toThrow();
    });
});
