import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { PlatformAuthController } from './presentation/platform-auth.controller';
import { LoginPlatformAdminService } from './application/login-platform-admin.service';
import { PlatformAdminRepository } from './domain/platform-admin.repository';
import { PrismaPlatformAdminRepository } from './infrastructure/prisma-platform-admin.repository';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [PlatformAuthController],
  providers: [
    {
      provide: PlatformAdminRepository,
      useClass: PrismaPlatformAdminRepository,
    },
    LoginPlatformAdminService,
  ],
})
export class PlatformModule {}
