import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../auth/presentation/auth.guard';
import { PermissionsGuard } from '../../auth/presentation/permissions.guard';
import { RequirePermission } from '../../auth/presentation/require-permission.decorator';
import { SectorCatalogService } from '../application/sector-catalog.service';
import { ZoneCatalogService } from '../application/zone-catalog.service';
import { CatalogNotFoundError } from '../domain/catalog-errors';
import { CurrentTenant } from '../../../shared/presentation/request-context.decorator';
import {
  handleCatalogConflict,
  handleCatalogDomainError,
} from './catalog-http-errors';
import type { CreateZoneDto, CreateSectorDto } from './dto';

export type { CreateZoneDto, CreateSectorDto };

export const MANAGE_CATALOGS_PERMISSION = 'MANAGE_TENANT';
export const VIEW_CATALOGS_PERMISSIONS = [
  'MANAGE_TENANT',
  'REGISTER_PACKAGES',
  'CLASSIFY_PACKAGES',
  'COORDINATE_ROUTES',
] as const;

@Controller('zones')
@UseGuards(AuthGuard, PermissionsGuard)
export class ZonesController {
  constructor(
    private readonly zoneService: ZoneCatalogService,
    private readonly sectorService: SectorCatalogService,
  ) {}

  @Get()
  @RequirePermission(...VIEW_CATALOGS_PERMISSIONS)
  async listZones(@CurrentTenant() tenantId: string) {
    return this.zoneService.list(tenantId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission(MANAGE_CATALOGS_PERMISSION)
  async createZone(
    @CurrentTenant() tenantId: string,
    @Body() body: CreateZoneDto,
  ) {
    try {
      const result = await this.zoneService.create(tenantId, body);
      if (!result.ok) {
        return handleCatalogConflict(result.code);
      }
      return result.zone;
    } catch (error) {
      return handleCatalogDomainError(error);
    }
  }

  @Get(':zoneId')
  @RequirePermission(...VIEW_CATALOGS_PERMISSIONS)
  async getZone(
    @CurrentTenant() tenantId: string,
    @Param('zoneId') zoneId: string,
  ) {
    const zone = await this.zoneService.findById(tenantId, zoneId);
    if (!zone) {
      return handleCatalogDomainError(new CatalogNotFoundError(zoneId, 'Zone'));
    }
    return zone;
  }

  @Get(':zoneId/sectors')
  @RequirePermission(...VIEW_CATALOGS_PERMISSIONS)
  async listSectors(
    @CurrentTenant() tenantId: string,
    @Param('zoneId') zoneId: string,
  ) {
    const zone = await this.zoneService.findById(tenantId, zoneId);
    if (!zone) {
      return handleCatalogDomainError(new CatalogNotFoundError(zoneId, 'Zone'));
    }
    return this.sectorService.listByZone(tenantId, zoneId);
  }

  @Post(':zoneId/sectors')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission(MANAGE_CATALOGS_PERMISSION)
  async createSector(
    @CurrentTenant() tenantId: string,
    @Param('zoneId') zoneId: string,
    @Body() body: CreateSectorDto,
  ) {
    try {
      const result = await this.sectorService.create(tenantId, {
        zoneId,
        code: body.code,
        name: body.name,
      });

      if (!result.ok) {
        return handleCatalogConflict(result.code);
      }
      return result.sector;
    } catch (error) {
      return handleCatalogDomainError(error);
    }
  }

  @Get(':zoneId/sectors/:sectorId')
  @RequirePermission(...VIEW_CATALOGS_PERMISSIONS)
  async getSector(
    @CurrentTenant() tenantId: string,
    @Param('zoneId') zoneId: string,
    @Param('sectorId') sectorId: string,
  ) {
    const sector = await this.sectorService.findById(tenantId, sectorId);
    if (!sector || sector.zoneId !== zoneId) {
      return handleCatalogDomainError(
        new CatalogNotFoundError(sectorId, 'Sector'),
      );
    }
    return sector;
  }
}
