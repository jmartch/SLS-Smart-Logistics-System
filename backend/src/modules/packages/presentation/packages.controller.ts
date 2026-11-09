import {
    BadRequestException,
    Body,
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    ParseUUIDPipe,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../auth/presentation/auth.guard';
import { PermissionsGuard } from '../../auth/presentation/permissions.guard';
import { RequirePermission } from '../../auth/presentation/require-permission.decorator';
import {
    ClassifyPackageService,
    type ClassifyPackageResult,
} from '../application/classify-package.service';
import {
    RegisterAndGeocodePackageUseCase,
    type RegisterAndGeocodePackageResult,
} from '../application/register-and-geocode-package.use-case';
import { ResolvePackageGeocodingUseCase } from '../application/resolve-package-geocoding.use-case';
import { ReviewPackageGeocodingUseCase } from '../application/review-package-geocoding.use-case';
import { CorrectPackageAddressUseCase } from '../application/correct-package-address.use-case';
import {
    CurrentContext,
    type RequestContext,
} from '../../../shared/presentation/request-context.decorator';
import { ClassifyPackageDto } from './dto/classify-package.dto';
import { ResolvePackageGeocodingDto } from './dto/resolve-package-geocoding.dto';
import { ReviewPackageGeocodingDto } from './dto/review-package-geocoding.dto';
import { CorrectPackageAddressDto } from './dto/correct-package-address.dto';
import type { RegisterPackageDto } from './dto/register-package.dto';
import { ListPackagesUseCase } from '../application/list-packages.use-case';
import { GetPackageDetailUseCase } from '../application/get-package-detail.use-case';
import { isPackageStateName } from '../domain/package-state.types';
import {
    handlePackageDomainError,
    handlePackageFailure,
} from './package-http-errors';

export const REGISTER_PACKAGES_PERMISSION = 'REGISTER_PACKAGES';
export const CLASSIFY_PACKAGES_PERMISSIONS = [
    'CLASSIFY_PACKAGES',
    'MANAGE_TENANT',
] as const;
export const COORDINATE_PACKAGE_PERMISSIONS = [
    'CLASSIFY_PACKAGES',
    'MANAGE_TENANT',
] as const;
export const VIEW_PACKAGES_PERMISSIONS = [
    'REGISTER_PACKAGES',
    'CLASSIFY_PACKAGES',
    'COORDINATE_ROUTES',
    'MANAGE_TENANT',
] as const;

const packageIdPipe = new ParseUUIDPipe({
    version: '4',
    exceptionFactory: () =>
        new BadRequestException({
            field: 'packageId',
            reason: 'packageId must be a UUID',
        }),
});

@Controller('packages')
@UseGuards(AuthGuard, PermissionsGuard)
export class PackagesController {
    constructor(
        private readonly registerPackage: RegisterAndGeocodePackageUseCase,
        private readonly listPackages: ListPackagesUseCase,
        private readonly getPackageDetail: GetPackageDetailUseCase,
        private readonly classifyPackage: ClassifyPackageService,
        private readonly resolveGeocoding: ResolvePackageGeocodingUseCase,
        private readonly reviewGeocoding: ReviewPackageGeocodingUseCase,
        private readonly correctAddress: CorrectPackageAddressUseCase,
    ) {}

    @Get()
    @RequirePermission(...VIEW_PACKAGES_PERMISSIONS)
    listPackagesEndpoint(
        @CurrentContext() context: RequestContext,
        @Query('state') state?: string,
    ) {
        if (state && isPackageStateName(state)) {
            return this.listPackages.execute(context.tenantId, { state });
        }
        return this.listPackages.execute(context.tenantId);
    }

    @Get(':packageId')
    @RequirePermission(...VIEW_PACKAGES_PERMISSIONS)
    async getPackageDetailEndpoint(
        @CurrentContext() context: RequestContext,
        @Param('packageId', packageIdPipe) packageId: string,
    ) {
        try {
            return await this.getPackageDetail.execute(
                context.tenantId,
                packageId,
            );
        } catch (error) {
            return handlePackageDomainError(error);
        }
    }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    @RequirePermission(REGISTER_PACKAGES_PERMISSION)
    async registerPackageEndpoint(
        @CurrentContext() context: RequestContext,
        @Body() body: RegisterPackageDto,
    ) {
        let result: RegisterAndGeocodePackageResult;

        try {
            result = await this.registerPackage.execute(
                {
                    tenantId: context.tenantId,
                    actorUserId: context.actorUserId,
                    correlationId: context.correlationId,
                },
                body ?? {},
            );
        } catch (error) {
            return handlePackageDomainError(error);
        }

        if (!result.ok) {
            return handlePackageFailure(result.code);
        }

        return {
            ...result.package,
            geocoding: result.geocoding,
        };
    }

    @Post(':packageId/classify')
    @HttpCode(HttpStatus.OK)
    @RequirePermission(...CLASSIFY_PACKAGES_PERMISSIONS)
    async classifyPackageEndpoint(
        @CurrentContext() context: RequestContext,
        @Param('packageId', packageIdPipe) packageId: string,
        @Body() body: ClassifyPackageDto,
    ) {
        let result: ClassifyPackageResult;

        try {
            result = await this.classifyPackage.execute(
                {
                    tenantId: context.tenantId,
                    actorUserId: context.actorUserId,
                    correlationId: context.correlationId,
                },
                packageId,
                body ?? {},
            );
        } catch (error) {
            return handlePackageDomainError(error);
        }

        if (!result.ok) {
            return handlePackageFailure(result.code);
        }

        return result.package;
    }

    @Post(':packageId/geocoding/resolve')
    @HttpCode(HttpStatus.OK)
    @RequirePermission(...COORDINATE_PACKAGE_PERMISSIONS)
    async resolveGeocodingEndpoint(
        @CurrentContext() context: RequestContext,
        @Param('packageId', packageIdPipe) packageId: string,
        @Body() body: ResolvePackageGeocodingDto,
    ) {
        try {
            return await this.resolveGeocoding.execute({
                tenantId: context.tenantId,
                packageId,
                actorUserId: context.actorUserId,
                correlationId: context.correlationId,
                expectedAttemptId: body?.expectedAttemptId,
                forceRetry: body?.forceRetry,
                operationId: body?.operationId,
            });
        } catch (error) {
            return handlePackageDomainError(error);
        }
    }

    @Post(':packageId/geocoding/review')
    @HttpCode(HttpStatus.OK)
    @RequirePermission(...COORDINATE_PACKAGE_PERMISSIONS)
    async reviewGeocodingEndpoint(
        @CurrentContext() context: RequestContext,
        @Param('packageId', packageIdPipe) packageId: string,
        @Body() body: ReviewPackageGeocodingDto,
    ) {
        try {
            return await this.reviewGeocoding.execute({
                tenantId: context.tenantId,
                packageId,
                expectedAddressId: body.expectedAddressId,
                expectedAttemptId: body.expectedAttemptId,
                candidateId: body.candidateId,
                decision: body.decision,
                reason: body.reason,
                reviewerUserId: context.actorUserId,
                correlationId: context.correlationId,
                operationId: body.operationId,
            });
        } catch (error) {
            return handlePackageDomainError(error);
        }
    }

    @Post(':packageId/address-corrections')
    @HttpCode(HttpStatus.OK)
    @RequirePermission(...COORDINATE_PACKAGE_PERMISSIONS)
    async correctAddressEndpoint(
        @CurrentContext() context: RequestContext,
        @Param('packageId', packageIdPipe) packageId: string,
        @Body() body: CorrectPackageAddressDto,
    ) {
        try {
            return await this.correctAddress.execute({
                tenantId: context.tenantId,
                packageId,
                expectedAddressId: body.expectedAddressId,
                newOriginalText: body.newOriginalText,
                newMunicipalityCode: body.newMunicipalityCode,
                reason: body.reason,
                actorUserId: context.actorUserId,
                correlationId: context.correlationId,
                expectedAttemptId: body.expectedAttemptId,
            });
        } catch (error) {
            return handlePackageDomainError(error);
        }
    }
}
