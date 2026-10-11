import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../auth/presentation/auth.guard';
import { CurrentActor } from '../../auth/presentation/current-actor.decorator';
import type { ActorContext } from '../../../shared/application/actor-context';
import { ProvisionTenantService } from '../application/provision-tenant.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { PlatformAdminGuard } from './platform-admin.guard';

@Controller('api/platform/tenants')
@UseGuards(AuthGuard, PlatformAdminGuard)
export class PlatformTenantsController {
  constructor(private readonly provisionTenant: ProvisionTenantService) {}

  @Post()
  @HttpCode(201)
  async create(
    @Body() dto: CreateTenantDto,
    @CurrentActor() actor: ActorContext,
  ) {
    // PlatformAdminGuard already rejected other actors; kept so the actor id
    // is narrowed from the session and can never come from the body.
    if (actor.kind !== 'PLATFORM_ADMIN') {
      throw new ForbiddenException({
        error: {
          code: 'PERMISSION_DENIED',
          message: 'Solo la plataforma puede realizar esta operacion.',
          fields: null,
        },
      });
    }

    const result = await this.provisionTenant.provision({
      name: dto.name,
      adminEmail: dto.adminEmail,
      adminPassword: dto.adminPassword,
      actorPlatformAdminId: actor.platformAdminId,
    });

    if (result.kind === 'INVALID_NAME') {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Los datos enviados no son validos.',
          fields: [
            {
              field: 'name',
              reason: 'name must contain at least one letter or digit',
            },
          ],
        },
      });
    }

    if (result.kind === 'SLUG_ALREADY_EXISTS') {
      throw new ConflictException({
        error: {
          code: 'TENANT_SLUG_ALREADY_EXISTS',
          message:
            'Ya existe una empresa con un nombre que genera el mismo identificador.',
          fields: null,
        },
      });
    }

    return { tenantId: result.tenantId, slug: result.slug };
  }
}
