import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './database/prisma.module';
import { AssignmentsModule } from './modules/assignments/assignments.module';
import { RoutePlanningModule } from './modules/route-planning/route-planning.module';

@Module({
  imports: [PrismaModule, AssignmentsModule, RoutePlanningModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
