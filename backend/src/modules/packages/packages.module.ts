import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { TransitionPackageStateService } from './application/transition-package-state.service';
import { PackageLifecycleRepository } from './domain/package-lifecycle.repository';
import { PrismaPackageLifecycleRepository } from './infrastructure/prisma-package-lifecycle.repository';

@Module({
    imports: [PrismaModule],
    providers: [
        PrismaPackageLifecycleRepository,
        {
            provide: PackageLifecycleRepository,
            useExisting: PrismaPackageLifecycleRepository,
        },
        {
            provide: TransitionPackageStateService,
            useFactory: (
                lifecycleRepository: PackageLifecycleRepository,
            ) =>
                new TransitionPackageStateService(
                    lifecycleRepository,
                ),
            inject: [PackageLifecycleRepository],
        },
    ],
    exports: [TransitionPackageStateService],
})
export class PackagesModule { }