import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuthController } from './presentation/auth.controller';
import { AuthGuard } from './presentation/auth.guard';
import { LoginTenantUserService } from './application/login-tenant-user.service';
import { LogoutService } from './application/logout.service';
import { ResolveSessionService } from './application/resolve-session.service';
import { SessionRepository } from './domain/session.repository';
import { PrismaSessionRepository } from './infrastructure/prisma-session.repository';
import { TenantUserLookupRepository } from './domain/tenant-user-lookup.repository';
import { PrismaTenantUserLookupRepository } from './infrastructure/prisma-tenant-user-lookup.repository';

@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [
    { provide: SessionRepository, useClass: PrismaSessionRepository },
    {
      provide: TenantUserLookupRepository,
      useClass: PrismaTenantUserLookupRepository,
    },
    LoginTenantUserService,
    LogoutService,
    ResolveSessionService,
    AuthGuard,
  ],
  // Other modules' controllers use @UseGuards(AuthGuard); the guard is
  // instantiated in the host module, so its dependencies must be exported.
  exports: [
    AuthGuard,
    ResolveSessionService,
    TenantUserLookupRepository,
    SessionRepository,
  ],
})
export class AuthModule {}
