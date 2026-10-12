import {
  Body,
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
  constructor(private readonly registerVehicle: RegisterVehicleService) {}

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
