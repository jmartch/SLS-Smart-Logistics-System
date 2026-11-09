import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { PrismaService } from '../../database/prisma.service';
import { AuthModule } from '../auth/auth.module';
import { GeocodingModule } from '../geocoding/geocoding.module';
import { PackageGeocodingConfigAdapter } from '../../config/package-geocoding.config';
import { ClassifyPackageService } from './application/classify-package.service';
import { RegisterPackageService } from './application/register-package.service';
import { ListPackagesUseCase } from './application/list-packages.use-case';
import { GetPackageDetailUseCase } from './application/get-package-detail.use-case';
import { PackageQueryPort } from './application/ports/package-query.port';
import { TransitionPackageStateService } from './application/transition-package-state.service';
import { PackageLifecycleRepository } from './domain/package-lifecycle.repository';
import { CryptoPublicTrackingTokenGenerator } from './infrastructure/crypto-public-tracking-token.generator';
import { PrismaPackageClassificationAdapter } from './infrastructure/prisma-package-classification.adapter';
import { PrismaPackageLifecycleRepository } from './infrastructure/prisma-package-lifecycle.repository';
import { PrismaPackageRegistrationAdapter } from './infrastructure/prisma-package-registration.adapter';
import { PrismaPackageQueryAdapter } from './infrastructure/prisma-package-query.adapter';
import { PrismaPackageGeocodingUnitOfWork } from './infrastructure/prisma-package-geocoding.uow';
import { RegisterAndGeocodePackageUseCase } from './application/register-and-geocode-package.use-case';
import { ResolvePackageGeocodingUseCase } from './application/resolve-package-geocoding.use-case';
import { ReviewPackageGeocodingUseCase } from './application/review-package-geocoding.use-case';
import { CorrectPackageAddressUseCase } from './application/correct-package-address.use-case';
import { PackagesController } from './presentation/packages.controller';

@Module({
    imports: [PrismaModule, AuthModule, GeocodingModule],
    controllers: [PackagesController],
    providers: [
        PrismaPackageLifecycleRepository,
        PrismaPackageRegistrationAdapter,
        PrismaPackageClassificationAdapter,
        PackageGeocodingConfigAdapter,
        {
            provide: PrismaPackageQueryAdapter,
            useFactory: (prisma: PrismaService) =>
                new PrismaPackageQueryAdapter(prisma),
            inject: [PrismaService],
        },
        CryptoPublicTrackingTokenGenerator,
        PrismaPackageGeocodingUnitOfWork,
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
            useFactory: (
                packages: PackageQueryPort,
                config: PackageGeocodingConfigAdapter,
            ) => new GetPackageDetailUseCase(packages, config),
            inject: [PackageQueryPort, PackageGeocodingConfigAdapter],
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
        {
            provide: ClassifyPackageService,
            useFactory: (classification: PrismaPackageClassificationAdapter) =>
                new ClassifyPackageService(classification),
            inject: [PrismaPackageClassificationAdapter],
        },
        {
            provide: ResolvePackageGeocodingUseCase,
            useFactory: (
                config: PackageGeocodingConfigAdapter,
                uow: PrismaPackageGeocodingUnitOfWork,
            ) => new ResolvePackageGeocodingUseCase(config, uow),
            inject: [
                PackageGeocodingConfigAdapter,
                PrismaPackageGeocodingUnitOfWork,
            ],
        },
        {
            provide: RegisterAndGeocodePackageUseCase,
            useFactory: (
                uow: PrismaPackageGeocodingUnitOfWork,
                tokenGen: CryptoPublicTrackingTokenGenerator,
                resolveUseCase: ResolvePackageGeocodingUseCase,
            ) =>
                new RegisterAndGeocodePackageUseCase(
                    uow,
                    tokenGen,
                    resolveUseCase,
                ),
            inject: [
                PrismaPackageGeocodingUnitOfWork,
                CryptoPublicTrackingTokenGenerator,
                ResolvePackageGeocodingUseCase,
            ],
        },
        {
            provide: ReviewPackageGeocodingUseCase,
            useFactory: (
                uow: PrismaPackageGeocodingUnitOfWork,
                config: PackageGeocodingConfigAdapter,
            ) => new ReviewPackageGeocodingUseCase(uow, config),
            inject: [
                PrismaPackageGeocodingUnitOfWork,
                PackageGeocodingConfigAdapter,
            ],
        },
        {
            provide: CorrectPackageAddressUseCase,
            useFactory: (
                uow: PrismaPackageGeocodingUnitOfWork,
                resolveUseCase: ResolvePackageGeocodingUseCase,
            ) => new CorrectPackageAddressUseCase(uow, resolveUseCase),
            inject: [
                PrismaPackageGeocodingUnitOfWork,
                ResolvePackageGeocodingUseCase,
            ],
        },
    ],
    exports: [
        TransitionPackageStateService,
        RegisterAndGeocodePackageUseCase,
        ResolvePackageGeocodingUseCase,
        ReviewPackageGeocodingUseCase,
        CorrectPackageAddressUseCase,
    ],
})
export class PackagesModule {}
