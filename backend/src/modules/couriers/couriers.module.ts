import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { RegisterCourierService } from './application/register-courier.service';
import { PrismaCourierAdapter } from './infrastructure/prisma-courier.adapter';
import { CouriersController } from './presentation/couriers.controller';
import { UsersModule } from '../users/users.module';
import { ManageCourierService } from './application/manage-courier.service';

@Module({
  imports: [PrismaModule, AuthModule, UsersModule],
  controllers: [CouriersController],
  providers: [
    PrismaCourierAdapter,
    {
      provide: ManageCourierService,
      useFactory: (couriers: PrismaCourierAdapter) =>
        new ManageCourierService(couriers),
      inject: [PrismaCourierAdapter],
    },
    {
      provide: RegisterCourierService,
      useFactory: (couriers: PrismaCourierAdapter) =>
        new RegisterCourierService(couriers),
      inject: [PrismaCourierAdapter],
    },
  ],
})
export class CouriersModule {}
