import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Get,
  Patch,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../auth/presentation/auth.guard';
import { PermissionsGuard } from '../../auth/presentation/permissions.guard';
import { RequirePermission } from '../../auth/presentation/require-permission.decorator';
import type { RegisterCourierResult } from '../application/register-courier.service';
import { RegisterCourierService } from '../application/register-courier.service';
import {
  CurrentContext,
  type RequestContext,
} from '../../../shared/presentation/request-context.decorator';
import {
  handleCourierDomainError,
  handleCourierFailure,
} from './courier-http-errors';
import type { CreateCourierDto } from './dto/create-courier.dto';
import { ManageCourierService } from '../application/manage-courier.service';
import { parseListCouriersQuery } from './dto/list-couriers.dto';

export const MANAGE_COURIERS_PERMISSION = 'MANAGE_TENANT';

@Controller('couriers')
@UseGuards(AuthGuard, PermissionsGuard)
export class CouriersController {
  constructor(
    private readonly registerCourier: RegisterCourierService,
    private readonly manageCourier: ManageCourierService,
  ) {}

  @Get()
  @RequirePermission(MANAGE_COURIERS_PERMISSION)
  async list(
    @CurrentContext() context: RequestContext,
    @Query() query: Record<string, unknown>,
  ) {
    try {
      return await this.manageCourier.list(
        context.tenantId,
        parseListCouriersQuery(query),
      );
    } catch (error) {
      return handleCourierDomainError(error);
    }
  }

  @Get('eligible-users')
  @RequirePermission(MANAGE_COURIERS_PERMISSION)
  async eligibleUsers(
    @CurrentContext() context: RequestContext,
    @Query() query: Record<string, unknown>,
  ) {
    try {
      return await this.manageCourier.eligibleUsers(
        context.tenantId,
        parseListCouriersQuery(query),
      );
    } catch (error) {
      return handleCourierDomainError(error);
    }
  }

  @Get(':courierId')
  @RequirePermission(MANAGE_COURIERS_PERMISSION)
  async get(
    @CurrentContext() context: RequestContext,
    @Param('courierId') id: string,
  ) {
    try {
      return await this.manageCourier.get(context.tenantId, id);
    } catch (error) {
      return handleCourierDomainError(error);
    }
  }

  @Patch(':courierId/status')
  @RequirePermission(MANAGE_COURIERS_PERMISSION)
  async changeStatus(
    @CurrentContext() context: RequestContext,
    @Param('courierId') id: string,
    @Body() body: unknown,
  ) {
    try {
      return await this.manageCourier.changeStatus(context, id, body);
    } catch (error) {
      return handleCourierDomainError(error);
    }
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission(MANAGE_COURIERS_PERMISSION)
  async createCourier(
    @CurrentContext() context: RequestContext,
    @Body() body: CreateCourierDto,
  ) {
    let result: RegisterCourierResult;

    try {
      result = await this.registerCourier.execute(context, body ?? {});
    } catch (error) {
      return handleCourierDomainError(error);
    }

    if (!result.ok) {
      return handleCourierFailure(result.code);
    }

    return result.courier;
  }
}
