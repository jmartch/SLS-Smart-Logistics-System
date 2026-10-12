import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ShipmentTypeCatalogService } from '../application/shipment-type-catalog.service';
import { CatalogNotFoundError } from '../domain/catalog-errors';
import { CurrentTenant } from '../../../shared/presentation/request-context.decorator';
import {
  handleCatalogConflict,
  handleCatalogDomainError,
} from './catalog-http-errors';
import type { CreateShipmentTypeDto } from './dto';

export type { CreateShipmentTypeDto };

@Controller('shipment-types')
export class ShipmentTypesController {
  constructor(
    private readonly shipmentTypeService: ShipmentTypeCatalogService,
  ) {}

  @Get()
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
