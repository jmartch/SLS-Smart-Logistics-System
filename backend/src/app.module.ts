import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './database/prisma.module';
import { AssignmentsModule } from './modules/assignments/assignments.module';
import { AuthModule } from './modules/auth/auth.module';
import { GeocodingModule } from './modules/geocoding/geocoding.module';
import { PackagesModule } from './modules/packages/packages.module';
import { PlatformModule } from './modules/platform/platform.module';
import { RoutePlanningModule } from './modules/route-planning/route-planning.module';
import { UsersModule } from './modules/users/users.module';
import { RoutesModule } from './modules/routes/routes.module';
import { ZonesModule } from './modules/zones/zones.module';
import { DeliveriesModule } from './modules/deliveries/deliveries.module';

@Module({
  imports: [
    PrismaModule,
    AssignmentsModule,
    AuthModule,
    GeocodingModule,
    PackagesModule,
    PlatformModule,
    RoutePlanningModule,
    UsersModule,
    RoutesModule,
    ZonesModule,
    DeliveriesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
