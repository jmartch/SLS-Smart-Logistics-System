import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../auth/presentation/auth.guard';
import { PermissionsGuard } from '../../auth/presentation/permissions.guard';
import { RequirePermission } from '../../auth/presentation/require-permission.decorator';
import { ShipmentTypeCatalogService } from '../application/shipment-type-catalog.service';
import { CatalogNotFoundError } from '../domain/catalog-errors';
import { CurrentTenant } from '../../../shared/presentation/request-context.decorator';
import {
  handleCatalogConflict,
  handleCatalogDomainError,
} from './catalog-http-errors';
import type { CreateShipmentTypeDto } from './dto';
import {
  MANAGE_CATALOGS_PERMISSION,
  VIEW_CATALOGS_PERMISSIONS,
} from './zones.controller';

export type { CreateShipmentTypeDto };

@Controller('shipment-types')
@UseGuards(AuthGuard, PermissionsGuard)
export class ShipmentTypesController {
  constructor(
    private readonly shipmentTypeService: ShipmentTypeCatalogService,
  ) {}

  @Get()
  @RequirePermission(...VIEW_CATALOGS_PERMISSIONS)
  async listShipmentTypes(
    @CurrentTenant() tenantId: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.shipmentTypeService.list(tenantId, {
      includeInactive: includeInactive === 'true',
    });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission(MANAGE_CATALOGS_PERMISSION)
  async createShipmentType(
    @CurrentTenant() tenantId: string,
    @Body() body: CreateShipmentTypeDto,
  ) {
    try {
      const result = await this.shipmentTypeService.create(tenantId, body);
      if (!result.ok) {
        return handleCatalogConflict(result.code);
      }
      return result.shipmentType;
    } catch (error) {
      return handleCatalogDomainError(error);
    }
  }

  @Get(':id')
  @RequirePermission(...VIEW_CATALOGS_PERMISSIONS)
  async getShipmentType(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ) {
    const shipmentType = await this.shipmentTypeService.findById(tenantId, id);
    if (!shipmentType) {
      return handleCatalogDomainError(
        new CatalogNotFoundError(id, 'Shipment type'),
      );
    }
    return shipmentType;
  }
}
