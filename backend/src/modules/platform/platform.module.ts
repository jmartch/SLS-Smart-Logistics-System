import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { PlatformAuthController } from './presentation/platform-auth.controller';
import { PlatformTenantsController } from './presentation/platform-tenants.controller';
import { PlatformAdminGuard } from './presentation/platform-admin.guard';
import { LoginPlatformAdminService } from './application/login-platform-admin.service';
import { ProvisionTenantService } from './application/provision-tenant.service';
import { PlatformAdminRepository } from './domain/platform-admin.repository';
import { TenantProvisioningRepository } from './domain/tenant-provisioning.repository';
import { PrismaPlatformAdminRepository } from './infrastructure/prisma-platform-admin.repository';
import { PrismaTenantProvisioningRepository } from './infrastructure/prisma-tenant-provisioning.repository';
import { ProvisioningPrismaService } from './infrastructure/provisioning-prisma.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [PlatformAuthController, PlatformTenantsController],
  providers: [
    {
      provide: PlatformAdminRepository,
      useClass: PrismaPlatformAdminRepository,
    },
    LoginPlatformAdminService,
    // The sls_provisioning connection stays private to this module: it is
    // neither exported nor part of the global PrismaModule.
    ProvisioningPrismaService,
    {
      provide: TenantProvisioningRepository,
      useClass: PrismaTenantProvisioningRepository,
    },
    ProvisionTenantService,
    PlatformAdminGuard,
  ],
})
export class PlatformModule {}
