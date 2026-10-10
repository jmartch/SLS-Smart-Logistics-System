import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaService } from '../src/database/prisma.service';
import { BuildRouteRoadPathService } from '../src/modules/route-planning/application/build-route-road-path.service';
import { FindRoadPathService } from '../src/modules/route-planning/application/find-road-path.service';
import { PlanExistingRouteRoadPathService } from '../src/modules/route-planning/application/plan-existing-route-road-path.service';
import { DijkstraShortestPath } from '../src/modules/route-planning/domain/dijkstra-shortest-path';
import { PrismaRoadGraphRepository } from '../src/modules/route-planning/infrastructure/graph-repository';
import { PrismaRoadPathGeometryRepository } from '../src/modules/route-planning/infrastructure/path-geometry-repository';
import { PrismaRouteRoadPathRepository } from '../src/modules/route-planning/infrastructure/route-road-path.repository';
import { PrismaRouteRoadWaypointRepository } from '../src/modules/route-planning/infrastructure/route-road-waypoint.repository';

describe('Persistencia integral de caminos GDB-05', () => {
    const admin = new PrismaClient({
        adapter: new PrismaPg({
            connectionString: process.env.DATABASE_URL,
        }),
    });

    const app = new PrismaService();

    const tenantId = randomUUID();
    const otherTenantId = randomUUID();
    const userId = randomUUID();
    const vehicleId = randomUUID();
    const courierId = randomUUID();
    const datasetId = randomUUID();
    const planningRequestId = randomUUID();
    const depotId = randomUUID();
    const routeId = randomUUID();
    const depotNodeId = randomUUID();
    const firstStopNodeId = randomUUID();
    const secondStopNodeId = randomUUID();

    const depotToFirstEdgeId = randomUUID();
    const firstToSecondEdgeId = randomUUID();
    const secondToDepotEdgeId = randomUUID();

    const firstAddressId = randomUUID();
    const secondAddressId = randomUUID();

    const firstAttemptId = randomUUID();
    const secondAttemptId = randomUUID();

    const firstCandidateId = randomUUID();
    const secondCandidateId = randomUUID();

    const firstAttachmentId = randomUUID();
    const secondAttachmentId = randomUUID();

    const firstRouteStopId = randomUUID();
    const secondRouteStopId = randomUUID();

    let service: PlanExistingRouteRoadPathService;

    beforeAll(async () => {
        for (const variable of ['DATABASE_URL', 'RUNTIME_DATABASE_URL'] as const) {
            const connectionString = process.env[variable];

            if (!connectionString) {
                throw new Error(`${variable} is required`);
            }

            const databasePath = new URL(connectionString).pathname;

            if (!/^\/sls_gdb05_[0-9a-f]{32}$/.test(databasePath)) {
                throw new Error(
                    `${variable} must point to a disposable database created by gdb-05.cjs`,
                );
            }
        }

        await admin.$connect();
        await app.$connect();

        await admin.$transaction(async (transaction) => {
            await transaction.tenant.create({
                data: {
                    id: tenantId,
                    name: `GDB-05 E2E ${tenantId}`,
                    slug: `gdb-05-e2e-${tenantId}`,
                    status: 'ACTIVE',
                },
            });

            await transaction.tenant.create({
                data: {
                    id: otherTenantId,
                    name: `GDB-05 foreign tenant ${otherTenantId}`,
                    slug: `gdb-05-foreign-${otherTenantId}`,
                    status: 'ACTIVE',
                },
            });

            await transaction.user.create({
                data: {
                    id: userId,
                    tenantId,
                    email: `gdb05-${userId}@example.test`,
                    passwordHash: 'not-a-real-password',
                    status: 'ACTIVE',
                },
            });

            await transaction.vehicle.create({
                data: {
                    id: vehicleId,
                    tenantId,
                    plate: `GDB${vehicleId.slice(0, 5)}`,
                    maxWeightKg: '1000',
                    maxVolumeM3: '20',
                    status: 'ACTIVE',
                },
            });

            await transaction.courier.create({
                data: {
                    id: courierId,
                    tenantId,
                    userId,
                    status: 'ACTIVE',
                },
            });

            await transaction.geoDataset.create({
                data: {
                    id: datasetId,
                    name: `GDB-05 route integration ${datasetId}`,
                    sourceType: 'SYNTHETIC',
                    sourceReference: `route-path-${datasetId}`,
                    sourceDate: new Date(),
                    checksum: 'b'.repeat(64),
                    license: 'test-only',
                    coverage: 'synthetic integration graph',
                    importerVersion: 'gdb-05-e2e',
                    status: 'READY',
                    readyAt: new Date(),
                },
            });

            await transaction.$executeRaw`
                INSERT INTO "RoadNode"
                (
                    "id",
                    "datasetId",
                    "location"
                )
                VALUES
                (
                    ${depotNodeId}::uuid,
                    ${datasetId}::uuid,
                    ST_SetSRID(ST_MakePoint(${-74.8}, ${10.98}), 4326)
                ),
                (
                    ${firstStopNodeId}::uuid,
                    ${datasetId}::uuid,
                    ST_SetSRID(ST_MakePoint(${-74.79}, ${10.99}), 4326)
                ),
                (
                    ${secondStopNodeId}::uuid,
                    ${datasetId}::uuid,
                    ST_SetSRID(ST_MakePoint(${-74.78}, ${11.0}), 4326)
                )
            `;

            await transaction.$executeRaw`
                INSERT INTO "RoadEdge"
                (
                    "id",
                    "datasetId",
                    "fromNodeId",
                    "toNodeId",
                    "profile",
                    "distanceM",
                    "durationS",
                    "roadClass",
                    "geometry"
                )
                VALUES
                (
                    ${depotToFirstEdgeId}::uuid,
                    ${datasetId}::uuid,
                    ${depotNodeId}::uuid,
                    ${firstStopNodeId}::uuid,
                    'MOTOR_VEHICLE',
                    1500,
                    180,
                    'residential',
                    ST_GeomFromText('LINESTRING(-74.80 10.98,-74.79 10.99)', 4326 )
                ),
                (
                    ${firstToSecondEdgeId}::uuid,
                    ${datasetId}::uuid,
                    ${firstStopNodeId}::uuid,
                    ${secondStopNodeId}::uuid,
                    'MOTOR_VEHICLE',
                    1400,
                    170,
                    'residential',
                    ST_GeomFromText('LINESTRING(-74.79 10.99,-74.78 11.00)', 4326 )
                ),
                (
                    ${secondToDepotEdgeId}::uuid,
                    ${datasetId}::uuid,
                    ${secondStopNodeId}::uuid,
                    ${depotNodeId}::uuid,
                    'MOTOR_VEHICLE',
                    1600,
                    190,
                    'residential',
                    ST_GeomFromText( 'LINESTRING(-74.78 11.00,-74.80 10.98)', 4326 )
                )
            `;


            await transaction.routePlanningRequest.create({
                data: {
                    id: planningRequestId,
                    tenantId,
                    requestedByUserId: userId,
                    status: 'IN_PROGRESS',
                    parameters: {
                        profile: 'MOTOR_VEHICLE',
                        costMetric: 'DISTANCE',
                    },
                    algorithm: 'DIJKSTRA',
                    algorithmVersion: '1',
                    datasetId,
                    datasetVersion: 'b'.repeat(64),
                },
            });

            await transaction.$executeRaw`
                INSERT INTO "Depot"
                (
                    "id",
                    "tenantId",
                    "name",
                    "location",
                    "timeZone",
                    "openingHours"
                )
                VALUES
                (
                    ${depotId}::uuid,
                    ${tenantId}::uuid,
                    'GDB-05 test depot',
                    ST_SetSRID(ST_MakePoint(${-74.8}, ${10.98}), 4326),
                    'America/Bogota',
                    ${JSON.stringify({ monday: [{ start: '08:00', end: '18:00' }], })}::jsonb
                )
            `;

            await transaction.route.create({
                data: {
                    id: routeId,
                    tenantId,
                    planningRequestId,
                    vehicleId,
                    courierId,
                    depotId,
                    state: 'PLANNED',
                    serviceDate: new Date('2026-09-26T00:00:00.000Z'),
                    plannedStartAt: new Date('2026-09-26T13:00:00.000Z'),
                    plannedEndAt: new Date('2026-09-26T17:00:00.000Z'),
                },
            });

            await transaction.address.createMany({
                data: [
                    {
                        id: firstAddressId,
                        tenantId,
                        originalText: 'Calle de prueba 1',
                        municipalityCode: '08001',
                    },
                    {
                        id: secondAddressId,
                        tenantId,
                        originalText: 'Calle de prueba 2',
                        municipalityCode: '08001',
                    },
                ],
            });

            await transaction.geocodingAttempt.createMany({
                data: [
                    {
                        id: firstAttemptId,
                        tenantId,
                        addressId: firstAddressId,
                        datasetId,
                        normalizedText: 'CALLE DE PRUEBA 1',
                        components: {
                            municipalityCode: '08001',
                        },
                        algorithmVersion: 'gdb-05-e2e',
                        status: 'MATCHED',
                    },
                    {
                        id: secondAttemptId,
                        tenantId,
                        addressId: secondAddressId,
                        datasetId,
                        normalizedText: 'CALLE DE PRUEBA 2',
                        components: {
                            municipalityCode: '08001',
                        },
                        algorithmVersion: 'gdb-05-e2e',
                        status: 'MATCHED',
                    },
                ],
            });

            await transaction.$executeRaw`
                INSERT INTO "GeocodingCandidate"
                (
                    "id",
                    "tenantId",
                    "attemptId",
                    "datasetId",
                    "rank",
                    "score",
                    "scoreBreakdown",
                    "source",
                    "precision",
                    "location"
                )
                VALUES
                (
                    ${firstCandidateId}::uuid,
                    ${tenantId}::uuid,
                    ${firstAttemptId}::uuid,
                    ${datasetId}::uuid,
                    1,
                    1,
                    ${JSON.stringify({ exact: true })}::jsonb,
                    'GDB-05 E2E',
                    'ENTRANCE',
                    ST_SetSRID(ST_MakePoint(${-74.79}, ${10.99}), 4326)
                    ),
                (
                    ${secondCandidateId}::uuid,
                    ${tenantId}::uuid,
                    ${secondAttemptId}::uuid,
                    ${datasetId}::uuid,
                    1,
                    1,
                    ${JSON.stringify({ exact: true })}::jsonb,
                    'GDB-05 E2E',
                    'ENTRANCE',
                    ST_SetSRID(ST_MakePoint(${-74.78}, ${11.0}), 4326)
                )
            `;

            await transaction.geocodingAttempt.update({
                where: {
                    id: firstAttemptId,
                },
                data: {
                    selectedCandidateId: firstCandidateId,
                },
            });

            await transaction.geocodingAttempt.update({
                where: {
                    id: secondAttemptId,
                },
                data: {
                    selectedCandidateId: secondCandidateId,
                },
            });

            await transaction.$executeRaw`
                INSERT INTO "NetworkAttachment"
                (
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
                )
                VALUES
                (
                    ${firstAttachmentId}::uuid,
                    ${tenantId}::uuid,
                    ${datasetId}::uuid,
                    ${firstCandidateId}::uuid,
                    'MOTOR_VEHICLE',
                    ${firstStopNodeId}::uuid,
                    NULL,
                    ST_SetSRID(ST_MakePoint(${-74.79}, ${10.99}), 4326),
                    0,
                    'AUTO_ACCEPTED'
                ),
                (
                    ${secondAttachmentId}::uuid,
                    ${tenantId}::uuid,
                    ${datasetId}::uuid,
                    ${secondCandidateId}::uuid,
                    'MOTOR_VEHICLE',
                    ${secondStopNodeId}::uuid,
                    NULL,
                    ST_SetSRID(ST_MakePoint(${-74.78}, ${11.0}), 4326),
                    0,
                    'AUTO_ACCEPTED'
                )
            `;

            await transaction.routeStop.createMany({
                data: [
                    {
                        id: firstRouteStopId,
                        tenantId,
                        routeId,
                        sequence: 1,
                        latitude: '10.990000',
                        longitude: '-74.790000',
                        state: 'PENDING',
                        geocodingAttemptId: firstAttemptId,
                    },
                    {
                        id: secondRouteStopId,
                        tenantId,
                        routeId,
                        sequence: 2,
                        latitude: '11.000000',
                        longitude: '-74.780000',
                        state: 'PENDING',
                        geocodingAttemptId: secondAttemptId,
                    },
                ],
            });
        });

        const pathFinder = new FindRoadPathService(
            new PrismaRoadGraphRepository(app),
            new DijkstraShortestPath(),
            new PrismaRoadPathGeometryRepository(app),
        );

        const pathBuilder = new BuildRouteRoadPathService(
            pathFinder,
            new PrismaRouteRoadPathRepository(app),
        );

        service = new PlanExistingRouteRoadPathService(
            new PrismaRouteRoadWaypointRepository(app),
            pathBuilder,
        );
    });

    afterAll(async () => {
        await app.$disconnect();
        await admin.$disconnect();
    });

    it('persiste salida, paradas intermedias y regreso al depósito sin escrituras parciales',
        async () => {
            const result = await service.execute({
                tenantId,
                routeId,
                profile: 'MOTOR_VEHICLE',
                costMetric: 'DISTANCE',
            });

            expect(result).toEqual({
                kind: 'PERSISTED',
                datasetChecksum: 'b'.repeat(64),
                legCount: 3,
                totalDistanceM: 4500,
                totalDurationS: 540,
            });

            const legs = await admin.routeLeg.findMany({
                where: {
                    tenantId,
                    routeId,
                },
                orderBy: {
                    sequence: 'asc',
                },
                select: {
                    sequence: true,
                    datasetId: true,
                    profile: true,
                    fromNodeId: true,
                    toNodeId: true,
                    distanceM: true,
                    durationS: true,
                    edges: {
                        orderBy: {
                            sequence: 'asc',
                        },
                        select: {
                            sequence: true,
                            roadEdgeId: true,
                        },
                    },
                },
            });

            expect(
                legs.map((leg) => ({
                    sequence: leg.sequence,
                    datasetId: leg.datasetId,
                    profile: leg.profile,
                    fromNodeId: leg.fromNodeId,
                    toNodeId: leg.toNodeId,
                    distanceM: leg.distanceM.toNumber(),
                    durationS: leg.durationS.toNumber(),
                    edges: leg.edges,
                })),
            ).toEqual([
                {
                    sequence: 1,
                    datasetId,
                    profile: 'MOTOR_VEHICLE',
                    fromNodeId: depotNodeId,
                    toNodeId: firstStopNodeId,
                    distanceM: 1500,
                    durationS: 180,
                    edges: [
                        {
                            sequence: 1,
                            roadEdgeId: depotToFirstEdgeId,
                        },
                    ],
                },
                {
                    sequence: 2,
                    datasetId,
                    profile: 'MOTOR_VEHICLE',
                    fromNodeId: firstStopNodeId,
                    toNodeId: secondStopNodeId,
                    distanceM: 1400,
                    durationS: 170,
                    edges: [
                        {
                            sequence: 1,
                            roadEdgeId: firstToSecondEdgeId,
                        },
                    ],
                },
                {
                    sequence: 3,
                    datasetId,
                    profile: 'MOTOR_VEHICLE',
                    fromNodeId: secondStopNodeId,
                    toNodeId: depotNodeId,
                    distanceM: 1600,
                    durationS: 190,
                    edges: [
                        {
                            sequence: 1,
                            roadEdgeId: secondToDepotEdgeId,
                        },
                    ],
                },
            ]);

            const persistedRoute = await admin.route.findUnique({
                where: {
                    id: routeId,
                },
                select: {
                    plannedDistanceM: true,
                    plannedDurationS: true,
                },
            });

            expect(persistedRoute?.plannedDistanceM?.toNumber()).toBe(4500);
            expect(persistedRoute?.plannedDurationS).toBe(540);
        },
    );

    it('conserva los tramos existentes cuando el camino de regreso no existe',
        async () => {
            const legsBeforeFailure = await admin.routeLeg.findMany({
                where: {
                    tenantId,
                    routeId,
                },
                orderBy: {
                    sequence: 'asc',
                },
                select: {
                    id: true,
                    sequence: true,
                    fromNodeId: true,
                    toNodeId: true,
                    edges: {
                        orderBy: {
                            sequence: 'asc',
                        },
                        select: {
                            id: true,
                            sequence: true,
                            roadEdgeId: true,
                        },
                    },
                },
            });

            const routeBeforeFailure = await admin.route.findUnique({
                where: {
                    id: routeId,
                },
                select: {
                    plannedDistanceM: true,
                    plannedDurationS: true,
                },
            });

            await admin.roadEdge.update({
                where: {
                    id: secondToDepotEdgeId,
                },
                data: {
                    profile: 'BICYCLE',
                },
            });

            try {
                const result = await service.execute({
                    tenantId,
                    routeId,
                    profile: 'MOTOR_VEHICLE',
                    costMetric: 'DISTANCE',
                });

                expect(result).toEqual({
                    kind: 'PATH_NOT_FOUND',
                    sequence: 3,
                    originNodeId: secondStopNodeId,
                    destinationNodeId: depotNodeId,
                });

                const legsAfterFailure = await admin.routeLeg.findMany({
                    where: {
                        tenantId,
                        routeId,
                    },
                    orderBy: {
                        sequence: 'asc',
                    },
                    select: {
                        id: true,
                        sequence: true,
                        fromNodeId: true,
                        toNodeId: true,
                        edges: {
                            orderBy: {
                                sequence: 'asc',
                            },
                            select: {
                                id: true,
                                sequence: true,
                                roadEdgeId: true,
                            },
                        },
                    },
                });

                const routeAfterFailure = await admin.route.findUnique({
                    where: {
                        id: routeId,
                    },
                    select: {
                        plannedDistanceM: true,
                        plannedDurationS: true,
                    },
                });

                expect(legsAfterFailure).toEqual(legsBeforeFailure);

                expect(routeAfterFailure?.plannedDistanceM?.toNumber()).toBe(
                    routeBeforeFailure?.plannedDistanceM?.toNumber(),
                );

                expect(routeAfterFailure?.plannedDurationS).toBe(
                    routeBeforeFailure?.plannedDurationS,
                );
            } finally {
                await admin.roadEdge.update({
                    where: {
                        id: secondToDepotEdgeId,
                    },
                    data: {
                        profile: 'MOTOR_VEHICLE',
                    },
                });
            }
        },
    );

    it('no permite que otro tenant consulte o modifique los caminos de la ruta',
        async () => {
            const legsBeforeAttempt = await admin.routeLeg.findMany({
                where: {
                    tenantId,
                    routeId,
                },
                orderBy: {
                    sequence: 'asc',
                },
                select: {
                    id: true,
                    sequence: true,
                    fromNodeId: true,
                    toNodeId: true,
                    edges: {
                        orderBy: {
                            sequence: 'asc',
                        },
                        select: {
                            id: true,
                            sequence: true,
                            roadEdgeId: true,
                        },
                    },
                },
            });

            const result = await service.execute({
                tenantId: otherTenantId,
                routeId,
                profile: 'MOTOR_VEHICLE',
                costMetric: 'DISTANCE',
            });

            expect(result).toEqual({
                kind: 'ROUTE_NOT_FOUND',
            });

            const legsAfterAttempt = await admin.routeLeg.findMany({
                where: {
                    tenantId,
                    routeId,
                },
                orderBy: {
                    sequence: 'asc',
                },
                select: {
                    id: true,
                    sequence: true,
                    fromNodeId: true,
                    toNodeId: true,
                    edges: {
                        orderBy: {
                            sequence: 'asc',
                        },
                        select: {
                            id: true,
                            sequence: true,
                            roadEdgeId: true,
                        },
                    },
                },
            });

            expect(legsAfterAttempt).toEqual(legsBeforeAttempt);
        },
    );
});