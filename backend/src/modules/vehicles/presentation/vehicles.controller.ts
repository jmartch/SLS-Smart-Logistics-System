import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { RegisterVehicleService } from '../application/register-vehicle.service';
import type { CreateVehicleResult } from '../application/ports/vehicle-repository.port';
import { CurrentTenant } from '../../../shared/presentation/request-context.decorator';
import type { CreateVehicleDto } from './dto/create-vehicle.dto';
import {
  handleVehicleConflict,
  handleVehicleDomainError,
} from './vehicle-http-errors';

@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly registerVehicle: RegisterVehicleService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createVehicle(
    @CurrentTenant() tenantId: string,
    @Body() body: CreateVehicleDto,
  ) {
    let result: CreateVehicleResult;

    try {
      result = await this.registerVehicle.execute(tenantId, body ?? {});
    } catch (error) {
      return handleVehicleDomainError(error);
    }

    if (!result.ok) {
      return handleVehicleConflict(result.code);
    }

    return result.vehicle;
  }
}
