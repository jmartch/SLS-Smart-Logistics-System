import {
    Body,
    Controller,
    HttpCode,
    HttpStatus,
    Post,
    Res,
    UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '../../auth/presentation/auth.guard';
import { PermissionsGuard } from '../../auth/presentation/permissions.guard';
import { RequirePermission } from '../../auth/presentation/require-permission.decorator';
import { PlanAndAssignRoutesService } from '../application/plan-and-assign-routes.service';
import type { PlanAndAssignRoutesResult } from '../application/ports/plan-and-assign-routes.contract';
import {
    CurrentContext,
    type RequestContext,
} from '../../../shared/presentation/request-context.decorator';
import { validateAndBuildCommand } from './dto/plan-and-assign-routes.dto';
import { handlePlanningDomainError } from './planning-http-errors';

export const COORDINATE_ROUTES_PERMISSION = 'COORDINATE_ROUTES';

@Controller('routes/planning')
@UseGuards(AuthGuard, PermissionsGuard)
@RequirePermission(COORDINATE_ROUTES_PERMISSION)
export class RoutePlanningController {
    constructor(
        private readonly planAndAssignService: PlanAndAssignRoutesService,
    ) { }

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
}