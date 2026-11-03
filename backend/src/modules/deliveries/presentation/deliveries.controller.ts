import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '../../auth/presentation/auth.guard';
import { PermissionsGuard } from '../../auth/presentation/permissions.guard';
import { RequirePermission } from '../../auth/presentation/require-permission.decorator';
import {
  CurrentContext,
  type RequestContext,
} from '../../../shared/presentation/request-context.decorator';
import { AttendRouteStopUseCase } from '../application/use-cases/attend-route-stop.use-case';
import { RecordSuccessfulDeliveryUseCase } from '../application/use-cases/record-successful-delivery.use-case';
import { RecordFailedDeliveryUseCase } from '../application/use-cases/record-failed-delivery.use-case';
import { RescheduleDeliveryUseCase } from '../application/use-cases/reschedule-delivery.use-case';
import { RequestPackageReturnUseCase } from '../application/use-cases/request-package-return.use-case';
import { ReturnPackageToDepotUseCase } from '../application/use-cases/return-package-to-depot.use-case';
import { ReportIncidentUseCase } from '../application/use-cases/report-incident.use-case';
import { GetDeliveryManifestUseCase } from '../application/use-cases/get-delivery-manifest.use-case';
import type { FilePayload } from '../application/use-cases/record-successful-delivery.use-case';
import { extractIdempotencyKey, validateUuid } from './dto/delivery-common.dto';
import {
  validateFailedDeliveryBody,
  validateReportIncidentBody,
  validateRequestPackageReturnBody,
  validateRescheduleDeliveryBody,
  validateReturnPackageToDepotBody,
  validateSuccessfulDeliveryBody,
} from './dto/delivery-requests.dto';
import { handleDeliveriesDomainError } from './deliveries-http-errors';

interface UploadedFileItem {
  readonly buffer: Buffer;
  readonly mimetype: string;
}

export const OPERATE_DELIVERIES_PERMISSION = 'OPERATE_DELIVERIES';
export const COORDINATE_ROUTES_PERMISSION = 'COORDINATE_ROUTES';
export const REGISTER_PACKAGES_PERMISSION = 'REGISTER_PACKAGES';
export const DELIVERY_EXECUTION_PERMISSIONS = [
  OPERATE_DELIVERIES_PERMISSION,
  COORDINATE_ROUTES_PERMISSION,
] as const;
export const DEPOT_RECEPTION_PERMISSIONS = [
  COORDINATE_ROUTES_PERMISSION,
  REGISTER_PACKAGES_PERMISSION,
] as const;

@Controller('deliveries')
@UseGuards(AuthGuard, PermissionsGuard)
@RequirePermission(...DELIVERY_EXECUTION_PERMISSIONS)
export class DeliveriesController {
  constructor(
    private readonly attendRouteStopUseCase: AttendRouteStopUseCase,
    private readonly recordSuccessfulDeliveryUseCase: RecordSuccessfulDeliveryUseCase,
    private readonly recordFailedDeliveryUseCase: RecordFailedDeliveryUseCase,
    private readonly rescheduleDeliveryUseCase: RescheduleDeliveryUseCase,
    private readonly requestPackageReturnUseCase: RequestPackageReturnUseCase,
    private readonly returnPackageToDepotUseCase: ReturnPackageToDepotUseCase,
    private readonly reportIncidentUseCase: ReportIncidentUseCase,
    private readonly getDeliveryManifestUseCase: GetDeliveryManifestUseCase,
  ) {}

  @Post('routes/:routeId/stops/:stopId/attend')
  @HttpCode(HttpStatus.OK)
  async attendRouteStop(
    @CurrentContext() context: RequestContext,
    @Param('routeId') routeIdParam: string,
    @Param('stopId') stopIdParam: string,
    @Headers() headers: Record<string, string | undefined>,
  ) {
    try {
      const routeId = validateUuid(routeIdParam, 'routeId');
      const stopId = validateUuid(stopIdParam, 'stopId');
      const requestId = extractIdempotencyKey(headers);

      return await this.attendRouteStopUseCase.execute({
        tenantId: context.tenantId,
        actorUserId: context.actorUserId,
        routeId,
        stopId,
        requestId,
        correlationId: context.correlationId,
      });
    } catch (error) {
      return handleDeliveriesDomainError(error);
    }
  }

  @Post('routes/:routeId/stops/:stopId/packages/:packageId/successful-attempts')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'photo', maxCount: 1 },
      { name: 'signature', maxCount: 1 },
    ]),
  )
  async recordSuccessfulDelivery(
    @CurrentContext() context: RequestContext,
    @Param('routeId') routeIdParam: string,
    @Param('stopId') stopIdParam: string,
    @Param('packageId') packageIdParam: string,
    @Headers() headers: Record<string, string | undefined>,
    @Body() body: Record<string, unknown>,
    @UploadedFiles()
    files?: {
      photo?: UploadedFileItem[];
      signature?: UploadedFileItem[];
    },
  ) {
    try {
      const routeId = validateUuid(routeIdParam, 'routeId');
      const stopId = validateUuid(stopIdParam, 'stopId');
      const packageId = validateUuid(packageIdParam, 'packageId');
      const requestId = extractIdempotencyKey(headers);
      const { notes } = validateSuccessfulDeliveryBody(body);

      const payloadFiles: FilePayload[] = [];
      const photoFile = files?.photo?.[0];
      if (photoFile) {
        payloadFiles.push({
          type: 'PHOTO',
          buffer: photoFile.buffer,
          mimeType: photoFile.mimetype,
        });
      }
      const sigFile = files?.signature?.[0];
      if (sigFile) {
        payloadFiles.push({
          type: 'SIGNATURE',
          buffer: sigFile.buffer,
          mimeType: sigFile.mimetype,
        });
      }

      return await this.recordSuccessfulDeliveryUseCase.execute({
        tenantId: context.tenantId,
        actorUserId: context.actorUserId,
        routeId,
        stopId,
        packageId,
        files: payloadFiles,
        notes,
        requestId,
        correlationId: context.correlationId,
      });
    } catch (error) {
      return handleDeliveriesDomainError(error);
    }
  }

  @Post('routes/:routeId/stops/:stopId/packages/:packageId/failed-attempts')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'photo', maxCount: 1 },
      { name: 'signature', maxCount: 1 },
    ]),
  )
  async recordFailedDelivery(
    @CurrentContext() context: RequestContext,
    @Param('routeId') routeIdParam: string,
    @Param('stopId') stopIdParam: string,
    @Param('packageId') packageIdParam: string,
    @Headers() headers: Record<string, string | undefined>,
    @Body() body: Record<string, unknown>,
    @UploadedFiles()
    files?: {
      photo?: UploadedFileItem[];
      signature?: UploadedFileItem[];
    },
  ) {
    try {
      const routeId = validateUuid(routeIdParam, 'routeId');
      const stopId = validateUuid(stopIdParam, 'stopId');
      const packageId = validateUuid(packageIdParam, 'packageId');
      const requestId = extractIdempotencyKey(headers);
      const { reasonCode, notes } = validateFailedDeliveryBody(body);

      const payloadFiles: FilePayload[] = [];
      const photoFile = files?.photo?.[0];
      if (photoFile) {
        payloadFiles.push({
          type: 'PHOTO',
          buffer: photoFile.buffer,
          mimeType: photoFile.mimetype,
        });
      }
      const sigFile = files?.signature?.[0];
      if (sigFile) {
        payloadFiles.push({
          type: 'SIGNATURE',
          buffer: sigFile.buffer,
          mimeType: sigFile.mimetype,
        });
      }

      return await this.recordFailedDeliveryUseCase.execute({
        tenantId: context.tenantId,
        actorUserId: context.actorUserId,
        routeId,
        stopId,
        packageId,
        reasonCode,
        notes,
        files: payloadFiles,
        requestId,
        correlationId: context.correlationId,
      });
    } catch (error) {
      return handleDeliveriesDomainError(error);
    }
  }

  @Post('packages/:packageId/reschedules')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission(COORDINATE_ROUTES_PERMISSION)
  async rescheduleDelivery(
    @CurrentContext() context: RequestContext,
    @Param('packageId') packageIdParam: string,
    @Headers() headers: Record<string, string | undefined>,
    @Body() body: Record<string, unknown>,
  ) {
    try {
      const packageId = validateUuid(packageIdParam, 'packageId');
      const requestId = extractIdempotencyKey(headers);
      const parsed = validateRescheduleDeliveryBody(body);

      return await this.rescheduleDeliveryUseCase.execute({
        tenantId: context.tenantId,
        actorUserId: context.actorUserId,
        packageId,
        failedAttemptId: parsed.failedAttemptId,
        startAt: parsed.startAt,
        endAt: parsed.endAt,
        reasonCode: parsed.reasonCode,
        requestId,
        correlationId: context.correlationId,
      });
    } catch (error) {
      return handleDeliveriesDomainError(error);
    }
  }

  @Post('packages/:packageId/return-requests')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission(COORDINATE_ROUTES_PERMISSION)
  async requestPackageReturn(
    @CurrentContext() context: RequestContext,
    @Param('packageId') packageIdParam: string,
    @Headers() headers: Record<string, string | undefined>,
    @Body() body: Record<string, unknown>,
  ) {
    try {
      const packageId = validateUuid(packageIdParam, 'packageId');
      const requestId = extractIdempotencyKey(headers);
      const parsed = validateRequestPackageReturnBody(body);

      return await this.requestPackageReturnUseCase.execute({
        tenantId: context.tenantId,
        actorUserId: context.actorUserId,
        packageId,
        failedAttemptId: parsed.failedAttemptId,
        reasonCode: parsed.reasonCode,
        requestId,
        correlationId: context.correlationId,
      });
    } catch (error) {
      return handleDeliveriesDomainError(error);
    }
  }

  @Post('packages/:packageId/depot-receptions')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission(...DEPOT_RECEPTION_PERMISSIONS)
  async returnPackageToDepot(
    @CurrentContext() context: RequestContext,
    @Param('packageId') packageIdParam: string,
    @Headers() headers: Record<string, string | undefined>,
    @Body() body: Record<string, unknown>,
  ) {
    try {
      const packageId = validateUuid(packageIdParam, 'packageId');
      const requestId = extractIdempotencyKey(headers);
      const parsed = validateReturnPackageToDepotBody(body);

      return await this.returnPackageToDepotUseCase.execute({
        tenantId: context.tenantId,
        actorUserId: context.actorUserId,
        packageId,
        routeId: parsed.routeId,
        depotId: parsed.depotId,
        physicalReceiptConfirmed: parsed.physicalReceiptConfirmed,
        requestId,
        correlationId: context.correlationId,
      });
    } catch (error) {
      return handleDeliveriesDomainError(error);
    }
  }

  @Post('incidents')
  @HttpCode(HttpStatus.CREATED)
  async reportIncident(
    @CurrentContext() context: RequestContext,
    @Headers() headers: Record<string, string | undefined>,
    @Body() body: Record<string, unknown>,
  ) {
    try {
      const requestId = extractIdempotencyKey(headers);
      const parsed = validateReportIncidentBody(body);

      return await this.reportIncidentUseCase.execute({
        tenantId: context.tenantId,
        actorUserId: context.actorUserId,
        routeId: parsed.routeId,
        routeStopId: parsed.routeStopId,
        packageId: parsed.packageId,
        type: parsed.type,
        description: parsed.description,
        requestId,
        correlationId: context.correlationId,
      });
    } catch (error) {
      return handleDeliveriesDomainError(error);
    }
  }

  @Get('routes/:routeId/manifest')
  async getDeliveryManifest(
    @CurrentContext() context: RequestContext,
    @Param('routeId') routeIdParam: string,
    @Query('view') viewQuery?: string,
  ) {
    try {
      const routeId = validateUuid(routeIdParam, 'routeId');
      const view =
        viewQuery === 'failed'
          ? 'failed'
          : viewQuery === 'pending'
            ? 'pending'
            : 'all';

      return await this.getDeliveryManifestUseCase.execute({
        tenantId: context.tenantId,
        actorUserId: context.actorUserId,
        routeId,
        view,
      });
    } catch (error) {
      return handleDeliveriesDomainError(error);
    }
  }
}
