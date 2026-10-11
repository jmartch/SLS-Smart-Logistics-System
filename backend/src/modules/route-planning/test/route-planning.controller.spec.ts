import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    HttpStatus,
    NotFoundException,
    UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { RoutePlanningController } from '../presentation/route-planning.controller';
import { PlanAndAssignRoutesService } from '../application/plan-and-assign-routes.service';
import type { PlanAndAssignRoutesResult } from '../application/ports/plan-and-assign-routes.contract';
import { extractRequestContext } from '../../../shared/presentation/request-context.decorator';

const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const ZONE_ID = '20000000-0000-4000-8000-000000000001';
const DEPOT_ID = '30000000-0000-4000-8000-000000000001';
const PKG_ID_1 = '40000000-0000-4000-8000-000000000001';

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

    const controller = new RoutePlanningController(planAndAssignService);

    const context = {
        tenantId: TENANT_ID,
        actorUserId: 'user-coord-1',
        correlationId: 'corr-123',
    };

    return {
        controller,
        planAndAssignService,
        context,
    };
}

describe('RoutePlanningController', () => {
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

    describe('extractRequestContext', () => {
        it('extracts tenantId, actorUserId, and correlationId from request headers', () => {
            // Arrange
            const req = {
                headers: {
                    'x-tenant-id': TENANT_ID,
                    'x-user-id': 'coordinator-42',
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

        it('rejects with UnauthorizedException when tenant header is missing or invalid', () => {
            // Arrange
            const req = { headers: {} };

            // Act & Assert
            expect(() => extractRequestContext(req)).toThrow(UnauthorizedException);
        });
    });
});