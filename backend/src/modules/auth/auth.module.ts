import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuthController } from './presentation/auth.controller';
import { AuthGuard } from './presentation/auth.guard';
import { PermissionsGuard } from './presentation/permissions.guard';
import { LoginRateLimiter } from './presentation/login-rate-limiter';
import { LoginTenantUserService } from './application/login-tenant-user.service';
import { LogoutService } from './application/logout.service';
import { ResolveSessionService } from './application/resolve-session.service';
import { GetCurrentIdentityService } from './application/get-current-identity.service';
import { SessionRepository } from './domain/session.repository';
import { PrismaSessionRepository } from './infrastructure/prisma-session.repository';
import { TenantUserLookupRepository } from './domain/tenant-user-lookup.repository';
import { PrismaTenantUserLookupRepository } from './infrastructure/prisma-tenant-user-lookup.repository';
import { PlatformAdminLookup } from './domain/platform-admin-lookup.repository';
import { PrismaPlatformAdminLookup } from './infrastructure/prisma-platform-admin-lookup.repository';

@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [
    { provide: SessionRepository, useClass: PrismaSessionRepository },
    {
      provide: TenantUserLookupRepository,
      useClass: PrismaTenantUserLookupRepository,
    },
    { provide: PlatformAdminLookup, useClass: PrismaPlatformAdminLookup },
    LoginTenantUserService,
    LogoutService,
    GetCurrentIdentityService,
    ResolveSessionService,
    AuthGuard,
    PermissionsGuard,
    LoginRateLimiter,
  ],
  // Other modules' controllers use @UseGuards(AuthGuard, PermissionsGuard);
  // the guards are instantiated in the host module, so they and their
  // dependencies must be exported.
  exports: [
    AuthGuard,
    PermissionsGuard,
    LoginRateLimiter,
    ResolveSessionService,
    TenantUserLookupRepository,
    PlatformAdminLookup,
    SessionRepository,
  ],
})
export class AuthModule {}
