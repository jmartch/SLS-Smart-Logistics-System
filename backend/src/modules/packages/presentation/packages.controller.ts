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
import {
    ClassifyPackageService,
    type ClassifyPackageResult,
} from '../application/classify-package.service';
import {
    RegisterPackageService,
    type RegisterPackageResult,
} from '../application/register-package.service';
import {
    CurrentContext,
    type RequestContext,
} from '../../../shared/presentation/request-context.decorator';
import type { ClassifyPackageDto } from './dto/classify-package.dto';
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
export const VIEW_PACKAGES_PERMISSIONS = [
    'REGISTER_PACKAGES',
    'CLASSIFY_PACKAGES',
    'COORDINATE_ROUTES',
    'MANAGE_TENANT',
] as const;

@Controller('packages')
@UseGuards(AuthGuard, PermissionsGuard)
export class PackagesController {
    constructor(
        private readonly registerPackage: RegisterPackageService,
        private readonly listPackages: ListPackagesUseCase,
        private readonly getPackageDetail: GetPackageDetailUseCase,
        private readonly classifyPackage: ClassifyPackageService,
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
        @Param('packageId') packageId: string,
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
        let result: RegisterPackageResult;

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

        return result.package;
    }

    @Post(':packageId/classify')
    @HttpCode(HttpStatus.OK)
    @RequirePermission(...CLASSIFY_PACKAGES_PERMISSIONS)
    async classifyPackageEndpoint(
        @CurrentContext() context: RequestContext,
        @Param('packageId') packageId: string,
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
}
