import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './database/prisma.module';
import { AssignmentsModule } from './modules/assignments/assignments.module';
import { GeocodingModule } from './modules/geocoding/geocoding.module';
import { PackagesModule } from './modules/packages/packages.module';
import { RoutePlanningModule } from './modules/route-planning/route-planning.module';
import { RoutesModule } from './modules/routes/routes.module';
import { ZonesModule } from './modules/zones/zones.module';

@Module({
  imports: [
    PrismaModule,
    AssignmentsModule,
    GeocodingModule,
    PackagesModule,
    RoutePlanningModule,
    RoutesModule,
    ZonesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
