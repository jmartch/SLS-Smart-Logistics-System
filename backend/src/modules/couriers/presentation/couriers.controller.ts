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

export const MANAGE_COURIERS_PERMISSION = 'MANAGE_TENANT';

@Controller('couriers')
@UseGuards(AuthGuard, PermissionsGuard)
export class CouriersController {
  constructor(private readonly registerCourier: RegisterCourierService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission(MANAGE_COURIERS_PERMISSION)
  async createCourier(
    @CurrentContext() context: RequestContext,
    @Body() body: CreateCourierDto,
  ) {
    let result: RegisterCourierResult;

    try {
      result = await this.registerCourier.execute(context.tenantId, body ?? {});
    } catch (error) {
      return handleCourierDomainError(error);
    }

    if (!result.ok) {
      return handleCourierFailure(result.code);
    }

    return result.courier;
  }
}
