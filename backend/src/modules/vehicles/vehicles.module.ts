import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { RegisterVehicleService } from './application/register-vehicle.service';
import { PrismaVehicleAdapter } from './infrastructure/prisma-vehicle.adapter';
import { VehiclesController } from './presentation/vehicles.controller';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [VehiclesController],
  providers: [
    PrismaVehicleAdapter,
    {
      provide: RegisterVehicleService,
      useFactory: (vehicles: PrismaVehicleAdapter) =>
        new RegisterVehicleService(vehicles),
      inject: [PrismaVehicleAdapter],
    },
  ],
})
export class VehiclesModule {}
