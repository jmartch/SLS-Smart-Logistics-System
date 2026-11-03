import {
  Body,
  Param,
  Patch,
  Get,
  Query,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../auth/presentation/auth.guard';
import { PermissionsGuard } from '../../auth/presentation/permissions.guard';
import { RequirePermission } from '../../auth/presentation/require-permission.decorator';
import { RegisterVehicleService } from '../application/register-vehicle.service';
import { ListVehiclesUseCase } from '../application/list-vehicles.use-case';
import { ManageVehicleService } from '../application/manage-vehicle.service';
import { parseListVehiclesQuery } from './dto/list-vehicles.dto';
import type { CreateVehicleResult } from '../application/ports/vehicle-repository.port';
import {
  CurrentContext,
  type RequestContext,
} from '../../../shared/presentation/request-context.decorator';
import type { CreateVehicleDto } from './dto/create-vehicle.dto';
import {
  handleVehicleConflict,
  handleVehicleDomainError,
} from './vehicle-http-errors';

export const MANAGE_VEHICLES_PERMISSION = 'MANAGE_TENANT';

@Controller('vehicles')
@UseGuards(AuthGuard, PermissionsGuard)
export class VehiclesController {
  constructor(
    private readonly registerVehicle: RegisterVehicleService,
    private readonly listVehicles: ListVehiclesUseCase,
    private readonly manageVehicle: ManageVehicleService,
  ) {}

  @Get()
  @RequirePermission(MANAGE_VEHICLES_PERMISSION)
  list(
    @CurrentContext() context: RequestContext,
    @Query() query: Record<string, unknown>,
  ) {
    return this.listVehicles.execute(
      context.tenantId,
      parseListVehiclesQuery(query),
    );
  }

  @Get(':vehicleId')
  @RequirePermission(MANAGE_VEHICLES_PERMISSION)
  async detail(
    @CurrentContext() context: RequestContext,
    @Param('vehicleId') vehicleId: string,
  ) {
    try {
      return await this.manageVehicle.detail(context.tenantId, vehicleId);
    } catch (error) {
      return handleVehicleDomainError(error);
    }
  }

  @Patch(':vehicleId')
  @RequirePermission(MANAGE_VEHICLES_PERMISSION)
  async update(
    @CurrentContext() context: RequestContext,
    @Param('vehicleId') vehicleId: string,
    @Body() body: unknown,
  ) {
    try {
      return await this.manageVehicle.update(context, vehicleId, body);
    } catch (error) {
      return handleVehicleDomainError(error);
    }
  }

  @Patch(':vehicleId/status')
  @RequirePermission(MANAGE_VEHICLES_PERMISSION)
  async changeStatus(
    @CurrentContext() context: RequestContext,
    @Param('vehicleId') vehicleId: string,
    @Body() body: unknown,
  ) {
    try {
      return await this.manageVehicle.changeStatus(context, vehicleId, body);
    } catch (error) {
      return handleVehicleDomainError(error);
    }
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission(MANAGE_VEHICLES_PERMISSION)
  async createVehicle(
    @CurrentContext() context: RequestContext,
    @Body() body: CreateVehicleDto,
  ) {
    let result: CreateVehicleResult;

    try {
      result = await this.registerVehicle.execute(context.tenantId, body ?? {});
    } catch (error) {
      return handleVehicleDomainError(error);
    }

    if (!result.ok) {
      return handleVehicleConflict(result.code);
    }

    return result.vehicle;
  }
}
