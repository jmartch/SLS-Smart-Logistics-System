import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { RegisterPackageService } from './application/register-package.service';
import { TransitionPackageStateService } from './application/transition-package-state.service';
import { PackageLifecycleRepository } from './domain/package-lifecycle.repository';
import { CryptoPublicTrackingTokenGenerator } from './infrastructure/crypto-public-tracking-token.generator';
import { PrismaPackageLifecycleRepository } from './infrastructure/prisma-package-lifecycle.repository';
import { PrismaPackageRegistrationAdapter } from './infrastructure/prisma-package-registration.adapter';
import { PackagesController } from './presentation/packages.controller';

@Module({
    imports: [PrismaModule],
    controllers: [PackagesController],
    providers: [
        PrismaPackageLifecycleRepository,
        PrismaPackageRegistrationAdapter,
        CryptoPublicTrackingTokenGenerator,
        {
            provide: PackageLifecycleRepository,
            useExisting: PrismaPackageLifecycleRepository,
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
