import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ShipmentTypeCatalogService } from '../application/shipment-type-catalog.service';
import { CurrentTenant } from './current-tenant.decorator';
import {
  handleCatalogConflict,
  handleCatalogDomainError,
} from './catalog-http-errors';

export interface CreateShipmentTypeDto {
  readonly code: string;
  readonly name: string;
  readonly active?: boolean;
}

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
      throw new NotFoundException({
        code: 'CATALOG_RESOURCE_NOT_FOUND',
        message: 'El tipo de envío solicitado no existe.',
      });
    }
    return shipmentType;
  }
}
