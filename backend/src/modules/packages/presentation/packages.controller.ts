import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
    RegisterPackageService,
    type RegisterPackageResult,
} from '../application/register-package.service';
import { CurrentTenant } from '../../../shared/presentation/request-context.decorator';
import type { RegisterPackageDto } from './dto/register-package.dto';
import {
    handlePackageDomainError,
    handlePackageFailure,
} from './package-http-errors';

@Controller('packages')
export class PackagesController {
    constructor(private readonly registerPackage: RegisterPackageService) {}

    @Post()
    @HttpCode(HttpStatus.CREATED)
    async registerPackageEndpoint(
        @CurrentTenant() tenantId: string,
        @Body() body: RegisterPackageDto,
    ) {
        let result: RegisterPackageResult;

        try {
            result = await this.registerPackage.execute(tenantId, body ?? {});
        } catch (error) {
            return handlePackageDomainError(error);
        }

        if (!result.ok) {
            return handlePackageFailure(result.code);
        }

        return result.package;
    }
}
