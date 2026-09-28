import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './database/prisma.module';
import { AssignmentsModule } from './modules/assignments/assignments.module';
import { PackagesModule } from './modules/packages/packages.module';
import { RoutePlanningModule } from './modules/route-planning/route-planning.module';

@Module({
  imports: [
    PrismaModule,
    AssignmentsModule,
    PackagesModule,
    RoutePlanningModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
