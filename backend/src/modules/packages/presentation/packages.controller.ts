import {
    Body,
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    Post,
    UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../auth/presentation/auth.guard';
import { PermissionsGuard } from '../../auth/presentation/permissions.guard';
import { RequirePermission } from '../../auth/presentation/require-permission.decorator';
import {
    RegisterPackageService,
    type RegisterPackageResult,
} from '../application/register-package.service';
import {
    CurrentContext,
    type RequestContext,
} from '../../../shared/presentation/request-context.decorator';
import type { RegisterPackageDto } from './dto/register-package.dto';
import { ListPackagesUseCase } from '../application/list-packages.use-case';
import {
    handlePackageDomainError,
    handlePackageFailure,
} from './package-http-errors';

export const REGISTER_PACKAGES_PERMISSION = 'REGISTER_PACKAGES';

@Controller('packages')
@UseGuards(AuthGuard, PermissionsGuard)
export class PackagesController {
    constructor(
        private readonly registerPackage: RegisterPackageService,
        private readonly listPackages: ListPackagesUseCase,
    ) {}

    @Get()
    @RequirePermission(REGISTER_PACKAGES_PERMISSION)
    listPackagesEndpoint(@CurrentContext() context: RequestContext) {
        return this.listPackages.execute(context.tenantId);
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
}
