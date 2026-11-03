import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    HttpStatus,
    NotFoundException,
    UnauthorizedException,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import type { Response } from 'express';
import { AuthGuard } from '../../auth/presentation/auth.guard';
import { PermissionsGuard } from '../../auth/presentation/permissions.guard';
import { REQUIRED_PERMISSION_KEY } from '../../auth/presentation/require-permission.decorator';
import {
    COORDINATE_ROUTES_PERMISSION,
    RoutePlanningController,
} from '../presentation/route-planning.controller';
import { GetPlanningWorkspaceService } from '../application/get-planning-workspace.service';
import { PlanAndAssignRoutesService } from '../application/plan-and-assign-routes.service';
import { ReplanEditableRouteService } from '../application/replan-editable-route.service';
import type { PlanAndAssignRoutesResult } from '../application/ports/plan-and-assign-routes.contract';
import type { PlanningWorkspaceSnapshot } from '../application/ports/planning-workspace-query.port';
import type { ReplanEditableRouteResult } from '../application/ports/replan-editable-route.contract';
import { extractRequestContext } from '../../../shared/presentation/request-context.decorator';

const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const ZONE_ID = '20000000-0000-4000-8000-000000000001';
const DEPOT_ID = '30000000-0000-4000-8000-000000000001';
const PKG_ID_1 = '40000000-0000-4000-8000-000000000001';
const ROUTE_ID_1 = '70000000-0000-4000-8000-000000000001';

function createValidBody() {
    return {
        requestId: '90000000-0000-4000-8000-000000000001',
        zoneId: ZONE_ID,
        packageIds: [PKG_ID_1],
        vehicleIds: ['50000000-0000-4000-8000-000000000001'],
        courierIds: ['60000000-0000-4000-8000-000000000001'],
        depotId: DEPOT_ID,
        datasetId: 'BAQ-ROAD-2026',
        profile: 'MOTOR_VEHICLE',
        window: {
            startAt: '2026-10-06T08:00:00.000Z',
            endAt: '2026-10-06T13:00:00.000Z',
        },
        radiusMeters: 2000,
        ordering: 'nearest-neighbor',
    };
}

function createTestContext() {
    const planAndAssignService = {
        execute: jest.fn(),
    } as unknown as jest.Mocked<PlanAndAssignRoutesService>;

    const getWorkspaceService = {
        execute: jest.fn(),
    } as unknown as jest.Mocked<GetPlanningWorkspaceService>;

    const replanEditableRouteService = {
        execute: jest.fn(),
    } as unknown as jest.Mocked<ReplanEditableRouteService>;

    const controller = new RoutePlanningController(
        planAndAssignService,
        getWorkspaceService,
        replanEditableRouteService,
    );

    const context = {
        tenantId: TENANT_ID,
        actorUserId: 'user-coord-1',
        correlationId: 'corr-123',
    };

    return {
        controller,
        planAndAssignService,
        getWorkspaceService,
        replanEditableRouteService,
        context,
    };
}

describe('RoutePlanningController', () => {
    it('protects route-planning endpoints with AuthGuard and PermissionsGuard', () => {
        // Arrange & Act
        const guards = Reflect.getMetadata(
            GUARDS_METADATA,
            RoutePlanningController,
        ) as unknown[];

        // Assert
        expect(guards).toEqual([AuthGuard, PermissionsGuard]);
    });

    it('requires COORDINATE_ROUTES permission on the controller', () => {
        // Arrange & Act
        const permission = Reflect.getMetadata(
            REQUIRED_PERMISSION_KEY,
            RoutePlanningController,
        ) as unknown;

        // Assert
        expect(permission).toBe(COORDINATE_ROUTES_PERMISSION);
    });

    describe('getWorkspace', () => {
        it('returns tenant-scoped planning workspace resources and editable PLANNED routes', async () => {
            const { controller, getWorkspaceService, context } =
                createTestContext();
            const snapshot: PlanningWorkspaceSnapshot = {
                tenantId: TENANT_ID,
                window: {
                    startAt: '2026-10-06T08:00:00.000Z',
                    endAt: '2026-10-06T13:00:00.000Z',
                },
                zones: [{ id: ZONE_ID, code: 'ZN-N', name: 'Zona Norte' }],
                depots: [
                    {
                        id: DEPOT_ID,
                        name: 'Bodega Norte',
                        timeZone: 'America/Bogota',
                        latitude: 10.9878,
                        longitude: -74.7889,
                    },
                ],
                datasets: [],
                vehicles: [],
                couriers: [],
                candidatePackages: [],
                editableRoutes: [],
            };
            getWorkspaceService.execute.mockResolvedValue(snapshot);

            const result = await controller.getWorkspace(
                context,
                ZONE_ID,
                '2026-10-06T08:00:00.000Z',
                '2026-10-06T13:00:00.000Z',
            );

            expect(result).toEqual(snapshot);
            expect(getWorkspaceService.execute).toHaveBeenCalledWith({
                tenantId: TENANT_ID,
                zoneId: ZONE_ID,
                window: {
                    startAt: '2026-10-06T08:00:00.000Z',
                    endAt: '2026-10-06T13:00:00.000Z',
                },
            });
        });

        it('rejects with BadRequestException when only startAt is provided without endAt', async () => {
            const { controller, context } = createTestContext();

            await expect(
                controller.getWorkspace(
                    context,
                    undefined,
                    '2026-10-06T08:00:00.000Z',
                    undefined,
                ),
            ).rejects.toThrow(BadRequestException);
        });
    });

    describe('planAndAssign', () => {
        it('executes planning successfully and returns 201 result when input is valid', async () => {
            // Arrange
            const { controller, planAndAssignService, context } = createTestContext();
            const body = createValidBody();
            const expectedResult: PlanAndAssignRoutesResult = {
                requestId: body.requestId,
                tenantId: TENANT_ID,
                status: 'COMPLETED',
                replayed: false,
                routes: [],
                outcomes: [],
            };
            planAndAssignService.execute.mockResolvedValue(expectedResult);

            const mockRes = { status: jest.fn() } as unknown as Response;

            // Act
            const result = await controller.planAndAssign(context, body, mockRes);

            // Assert
            expect(result).toEqual(expectedResult);
            expect(planAndAssignService.execute).toHaveBeenCalledTimes(1);
            expect(planAndAssignService.execute).toHaveBeenCalledWith(
                context,
                expect.objectContaining({
                    requestId: body.requestId,
                    zoneId: ZONE_ID,
                    packageIds: [PKG_ID_1],
                }),
            );
            expect(mockRes.status).not.toHaveBeenCalled();
        });

        it('sets HTTP status to 200 OK when the execution result is replayed', async () => {
            // Arrange
            const { controller, planAndAssignService, context } = createTestContext();
            const body = createValidBody();
            const replayedResult: PlanAndAssignRoutesResult = {
                requestId: body.requestId,
                tenantId: TENANT_ID,
                status: 'COMPLETED',
                replayed: true,
                routes: [],
                outcomes: [],
            };
            planAndAssignService.execute.mockResolvedValue(replayedResult);

            const mockRes = { status: jest.fn() } as unknown as Response;

            // Act
            const result = await controller.planAndAssign(context, body, mockRes);

            // Assert
            expect(result.replayed).toBe(true);
            expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.OK);
        });

        it('rejects with BadRequestException when body is not an object', async () => {
            // Arrange
            const { controller, context } = createTestContext();

            // Act & Assert
            await expect(controller.planAndAssign(context, null)).rejects.toThrow(
                BadRequestException,
            );
        });

        it('rejects with BadRequestException when packageIds is empty', async () => {
            // Arrange
            const { controller, context } = createTestContext();
            const body = { ...createValidBody(), packageIds: [] };

            // Act & Assert
            await expect(controller.planAndAssign(context, body)).rejects.toThrow(
                BadRequestException,
            );
        });

        it('rejects with BadRequestException when operating window startAt is after endAt', async () => {
            // Arrange
            const { controller, context } = createTestContext();
            const body = {
                ...createValidBody(),
                window: {
                    startAt: '2026-10-06T15:00:00.000Z',
                    endAt: '2026-10-06T10:00:00.000Z',
                },
            };

            // Act & Assert
            await expect(controller.planAndAssign(context, body)).rejects.toThrow(
                BadRequestException,
            );
        });

        it('translates REQUEST_ID_CONFLICT into ConflictException', async () => {
            // Arrange
            const { controller, planAndAssignService, context } = createTestContext();
            planAndAssignService.execute.mockRejectedValue(new Error('REQUEST_ID_CONFLICT'));

            // Act & Assert
            await expect(controller.planAndAssign(context, createValidBody())).rejects.toThrow(
                ConflictException,
            );
        });

        it('translates TENANT_MISMATCH into ForbiddenException', async () => {
            // Arrange
            const { controller, planAndAssignService, context } = createTestContext();
            planAndAssignService.execute.mockRejectedValue(new Error('TENANT_MISMATCH'));

            // Act & Assert
            await expect(controller.planAndAssign(context, createValidBody())).rejects.toThrow(
                ForbiddenException,
            );
        });

        it('translates active assignment conflict into ConflictException', async () => {
            // Arrange
            const { controller, planAndAssignService, context } = createTestContext();
            planAndAssignService.execute.mockRejectedValue(
                new Error('Package 4000 already has an active assignment'),
            );

            // Act & Assert
            await expect(controller.planAndAssign(context, createValidBody())).rejects.toThrow(
                ConflictException,
            );
        });

        it('translates PLANNING_RESULT_UNAVAILABLE into ConflictException', async () => {
            // Arrange
            const { controller, planAndAssignService, context } = createTestContext();
            planAndAssignService.execute.mockRejectedValue(
                new Error('PLANNING_RESULT_UNAVAILABLE'),
            );

            // Act & Assert
            await expect(controller.planAndAssign(context, createValidBody())).rejects.toThrow(
                ConflictException,
            );
        });

        it('translates not found snapshot package into NotFoundException', async () => {
            // Arrange
            const { controller, planAndAssignService, context } = createTestContext();
            planAndAssignService.execute.mockRejectedValue(
                new Error('Requested package 4000 not found in tenant snapshot'),
            );

            // Act & Assert
            await expect(controller.planAndAssign(context, createValidBody())).rejects.toThrow(
                NotFoundException,
            );
        });
    });

    describe('replanEditableRoute', () => {
        it('replans an editable PLANNED route and assigns selected candidate packages', async () => {
            const { controller, replanEditableRouteService, context } =
                createTestContext();
            const expected: ReplanEditableRouteResult = {
                routeId: ROUTE_ID_1,
                tenantId: TENANT_ID,
                state: 'PLANNED',
                vehicleId: '50000000-0000-4000-8000-000000000001',
                courierId: '60000000-0000-4000-8000-000000000001',
                totalDistanceMeters: 1850,
                stops: [
                    {
                        routeStopId: '95000000-0000-4000-8000-000000000001',
                        packageId: PKG_ID_1,
                        sequence: 1,
                    },
                ],
                outcomes: [],
            };
            replanEditableRouteService.execute.mockResolvedValue(expected);

            const result = await controller.replanEditableRoute(
                context,
                ROUTE_ID_1,
                { packageIds: [PKG_ID_1], ordering: 'nearest-neighbor' },
            );

            expect(result).toEqual(expected);
            expect(replanEditableRouteService.execute).toHaveBeenCalledWith(
                context,
                {
                    routeId: ROUTE_ID_1,
                    packageIds: [PKG_ID_1],
                    ordering: 'nearest-neighbor',
                },
            );
        });

        it('translates ROUTE_NOT_EDITABLE into ConflictException when route is READY or beyond', async () => {
            const { controller, replanEditableRouteService, context } =
                createTestContext();
            replanEditableRouteService.execute.mockRejectedValue(
                new Error(
                    "ROUTE_NOT_EDITABLE: Target route '7000' is in status 'READY'",
                ),
            );

            await expect(
                controller.replanEditableRoute(context, ROUTE_ID_1, {
                    packageIds: [PKG_ID_1],
                }),
            ).rejects.toThrow(ConflictException);
        });

        it('rejects invalid routeId with BadRequestException', async () => {
            const { controller, context } = createTestContext();

            await expect(
                controller.replanEditableRoute(context, 'not-a-uuid', {
                    packageIds: [PKG_ID_1],
                }),
            ).rejects.toThrow(BadRequestException);
        });
    });

    describe('extractRequestContext', () => {
        it('extracts tenantId, actorUserId, and correlationId from authenticated actor and correlation header', () => {
            // Arrange
            const req = {
                actor: {
                    kind: 'TENANT_USER' as const,
                    tenantId: TENANT_ID,
                    userId: 'coordinator-42',
                    permissions: new Set(['COORDINATE_ROUTES']),
                },
                headers: {
                    'x-correlation-id': 'corr-abc',
                },
            };

            // Act
            const ctx = extractRequestContext(req);

            // Assert
            expect(ctx.tenantId).toBe(TENANT_ID);
            expect(ctx.actorUserId).toBe('coordinator-42');
            expect(ctx.correlationId).toBe('corr-abc');
        });

        it('rejects with UnauthorizedException when authenticated actor is missing even if legacy headers are present', () => {
            // Arrange
            const req = {
                headers: {
                    'x-tenant-id': TENANT_ID,
                    'x-user-id': 'coordinator-42',
                },
            };

            // Act & Assert
            expect(() => extractRequestContext(req)).toThrow(UnauthorizedException);
        });
    });
});