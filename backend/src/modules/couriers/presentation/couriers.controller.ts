import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import type { RegisterCourierResult } from '../application/register-courier.service';
import { RegisterCourierService } from '../application/register-courier.service';
import { CurrentTenant } from '../../../shared/presentation/request-context.decorator';
import {
  handleCourierDomainError,
  handleCourierFailure,
} from './courier-http-errors';
import type { CreateCourierDto } from './dto/create-courier.dto';

@Controller('couriers')
export class CouriersController {
  constructor(private readonly registerCourier: RegisterCourierService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createCourier(
    @CurrentTenant() tenantId: string,
    @Body() body: CreateCourierDto,
  ) {
    let result: RegisterCourierResult;

    try {
      result = await this.registerCourier.execute(tenantId, body ?? {});
    } catch (error) {
      return handleCourierDomainError(error);
    }

    if (!result.ok) {
      return handleCourierFailure(result.code);
    }

    return result.courier;
  }
}
