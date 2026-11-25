import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '../../auth/presentation/auth.guard';
import { PermissionsGuard } from '../../auth/presentation/permissions.guard';
import { RequirePermission } from '../../auth/presentation/require-permission.decorator';
import { GetPlanningWorkspaceService } from '../application/get-planning-workspace.service';
import { PlanAndAssignRoutesService } from '../application/plan-and-assign-routes.service';
import { ReplanEditableRouteService } from '../application/replan-editable-route.service';
import type { PlanAndAssignRoutesResult } from '../application/ports/plan-and-assign-routes.contract';
import type { PlanningWorkspaceSnapshot } from '../application/ports/planning-workspace-query.port';
import type { ReplanEditableRouteResult } from '../application/ports/replan-editable-route.contract';
import {
  CurrentContext,
  type RequestContext,
} from '../../../shared/presentation/request-context.decorator';
import { validateAndBuildCommand } from './dto/plan-and-assign-routes.dto';
import { validateAndBuildReplanEditableRouteCommand } from './dto/replan-editable-route.dto';
import { handlePlanningDomainError } from './planning-http-errors';

export const COORDINATE_ROUTES_PERMISSION = 'COORDINATE_ROUTES';

@Controller('routes/planning')
@UseGuards(AuthGuard, PermissionsGuard)
@RequirePermission(COORDINATE_ROUTES_PERMISSION)
export class RoutePlanningController {
  constructor(
    private readonly planAndAssignService: PlanAndAssignRoutesService,
    private readonly getWorkspaceService: GetPlanningWorkspaceService,
    private readonly replanEditableRouteService?: ReplanEditableRouteService,
  ) {}

  @Get('workspace')
  async getWorkspace(
    @CurrentContext() context: RequestContext,
    @Query('zoneId') zoneId?: string,
    @Query('startAt') startAt?: string,
    @Query('endAt') endAt?: string,
    @Query('datasetId') datasetId?: string,
    @Query('profile')
    profile?: 'MOTOR_VEHICLE' | 'MOTORCYCLE' | 'BICYCLE' | 'FOOT',
  ): Promise<PlanningWorkspaceSnapshot> {
    try {
      if ((startAt && !endAt) || (!startAt && endAt)) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message:
            'startAt y endAt deben enviarse juntos cuando se filtra por ventana horaria.',
        });
      }

      return await this.getWorkspaceService.execute({
        tenantId: context.tenantId,
        zoneId: zoneId && zoneId.trim() !== '' ? zoneId : undefined,
        window:
          startAt && endAt
            ? { startAt: startAt.trim(), endAt: endAt.trim() }
            : undefined,
        datasetId:
          datasetId && datasetId.trim() !== '' ? datasetId.trim() : undefined,
        profile,
      });
    } catch (error) {
      return handlePlanningDomainError(error);
    }
  }

  @Post('plan-and-assign')
  @HttpCode(HttpStatus.CREATED)
  async planAndAssign(
    @CurrentContext() context: RequestContext,
    @Body() body: unknown,
    @Res({ passthrough: true }) res?: Response,
  ): Promise<PlanAndAssignRoutesResult> {
    try {
      const command = validateAndBuildCommand(body);
      const result = await this.planAndAssignService.execute(context, command);

      if (result.replayed && res?.status) {
        res.status(HttpStatus.OK);
      }

      return result;
    } catch (error) {
      return handlePlanningDomainError(error);
    }
  }

  @Post('routes/:routeId/replan')
  @HttpCode(HttpStatus.OK)
  async replanEditableRoute(
    @CurrentContext() context: RequestContext,
    @Param('routeId') routeId: string,
    @Body() body: unknown,
  ): Promise<ReplanEditableRouteResult> {
    try {
      if (!this.replanEditableRouteService) {
        throw new Error('ReplanEditableRouteService is not configured');
      }
      const command = validateAndBuildReplanEditableRouteCommand(routeId, body);
      return await this.replanEditableRouteService.execute(context, command);
    } catch (error) {
      return handlePlanningDomainError(error);
    }
  }
}
