import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { RegisterVehicleService } from './application/register-vehicle.service';
import { PrismaVehicleAdapter } from './infrastructure/prisma-vehicle.adapter';
import { VehiclesController } from './presentation/vehicles.controller';
import { ListVehiclesUseCase } from './application/list-vehicles.use-case';
import { PrismaVehicleQueryAdapter } from './infrastructure/prisma-vehicle-query.adapter';
import { ManageVehicleService } from './application/manage-vehicle.service';
import { PrismaVehicleManagementAdapter } from './infrastructure/prisma-vehicle-management.adapter';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [VehiclesController],
  providers: [
    PrismaVehicleManagementAdapter,
    {
      provide: ManageVehicleService,
      useFactory: (vehicles: PrismaVehicleManagementAdapter) =>
        new ManageVehicleService(vehicles),
      inject: [PrismaVehicleManagementAdapter],
    },
    PrismaVehicleQueryAdapter,
    {
      provide: ListVehiclesUseCase,
      useFactory: (vehicles: PrismaVehicleQueryAdapter) =>
        new ListVehiclesUseCase(vehicles),
      inject: [PrismaVehicleQueryAdapter],
    },
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
