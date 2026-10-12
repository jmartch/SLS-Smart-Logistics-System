import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { RegisterCourierService } from './application/register-courier.service';
import { PrismaCourierAdapter } from './infrastructure/prisma-courier.adapter';
import { CouriersController } from './presentation/couriers.controller';

@Module({
  imports: [PrismaModule],
  controllers: [CouriersController],
  providers: [
    PrismaCourierAdapter,
    {
      provide: RegisterCourierService,
      useFactory: (couriers: PrismaCourierAdapter) =>
        new RegisterCourierService(couriers),
      inject: [PrismaCourierAdapter],
    },
  ],
})
export class CouriersModule {}
