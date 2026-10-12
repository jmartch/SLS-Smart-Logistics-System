import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { RegisterPackageService } from './application/register-package.service';
import { ListPackagesUseCase } from './application/list-packages.use-case';
import { GetPackageDetailUseCase } from './application/get-package-detail.use-case';
import { PackageQueryPort } from './application/ports/package-query.port';
import { TransitionPackageStateService } from './application/transition-package-state.service';
import { PackageLifecycleRepository } from './domain/package-lifecycle.repository';
import { CryptoPublicTrackingTokenGenerator } from './infrastructure/crypto-public-tracking-token.generator';
import { PrismaPackageLifecycleRepository } from './infrastructure/prisma-package-lifecycle.repository';
import { PrismaPackageRegistrationAdapter } from './infrastructure/prisma-package-registration.adapter';
import { PrismaPackageQueryAdapter } from './infrastructure/prisma-package-query.adapter';
import { PackagesController } from './presentation/packages.controller';

@Module({
    imports: [PrismaModule, AuthModule],
    controllers: [PackagesController],
    providers: [
        PrismaPackageLifecycleRepository,
        PrismaPackageRegistrationAdapter,
        PrismaPackageQueryAdapter,
        CryptoPublicTrackingTokenGenerator,
        {
            provide: PackageLifecycleRepository,
            useExisting: PrismaPackageLifecycleRepository,
        },
        {
            provide: PackageQueryPort,
            useExisting: PrismaPackageQueryAdapter,
        },
        {
            provide: ListPackagesUseCase,
            useFactory: (packages: PackageQueryPort) =>
                new ListPackagesUseCase(packages),
            inject: [PackageQueryPort],
        },
        {
            provide: GetPackageDetailUseCase,
            useFactory: (packages: PackageQueryPort) =>
                new GetPackageDetailUseCase(packages),
            inject: [PackageQueryPort],
        },
        {
            provide: TransitionPackageStateService,
            useFactory: (lifecycleRepository: PackageLifecycleRepository) =>
                new TransitionPackageStateService(lifecycleRepository),
            inject: [PackageLifecycleRepository],
        },
        {
            provide: RegisterPackageService,
            useFactory: (
                registration: PrismaPackageRegistrationAdapter,
                tokens: CryptoPublicTrackingTokenGenerator,
            ) => new RegisterPackageService(registration, tokens),
            inject: [
                PrismaPackageRegistrationAdapter,
                CryptoPublicTrackingTokenGenerator,
            ],
        },
    ],
    exports: [TransitionPackageStateService],
})
export class PackagesModule {}
