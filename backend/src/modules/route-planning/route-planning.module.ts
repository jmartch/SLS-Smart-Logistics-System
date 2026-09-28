import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { BuildRouteRoadPathService } from './application/build-route-road-path.service';
import { FindRoadPathService } from './application/find-road-path.service';
import { PlanExistingRouteRoadPathService } from './application/plan-existing-route-road-path.service';
import { DijkstraShortestPath } from './domain/dijkstra-shortest-path';
import { RouteRoadPathRepository } from './domain/route-road-path.repository';
import { RouteRoadWaypointRepository } from './domain/route-road-waypoint.repository';
import { PrismaRoadGraphRepository } from './infrastructure/graph-repository';
import { PrismaRoadPathGeometryRepository } from './infrastructure/path-geometry-repository';
import { PrismaRouteRoadPathRepository } from './infrastructure/route-road-path.repository';
import { PrismaRouteRoadWaypointRepository } from './infrastructure/route-road-waypoint.repository';

@Module({
  imports: [PrismaModule],
  providers: [
    PrismaRoadGraphRepository,
    PrismaRoadPathGeometryRepository,
    PrismaRouteRoadPathRepository,
    PrismaRouteRoadWaypointRepository,
    {
      provide: RouteRoadPathRepository,
      useExisting: PrismaRouteRoadPathRepository,
    },
    {
      provide: RouteRoadWaypointRepository,
      useExisting: PrismaRouteRoadWaypointRepository,
    },
    {
      provide: FindRoadPathService,
      useFactory: (
        graphRepository: PrismaRoadGraphRepository,
        geometryRepository: PrismaRoadPathGeometryRepository,
      ) =>
        new FindRoadPathService(
          graphRepository,
          new DijkstraShortestPath(),
          geometryRepository,
        ),
      inject: [PrismaRoadGraphRepository, PrismaRoadPathGeometryRepository],
    },
    {
      provide: BuildRouteRoadPathService,
      useFactory: (
        pathFinder: FindRoadPathService,
        repository: RouteRoadPathRepository,
      ) => new BuildRouteRoadPathService(pathFinder, repository),
      inject: [FindRoadPathService, RouteRoadPathRepository],
    },
    {
      provide: PlanExistingRouteRoadPathService,
      useFactory: (
        waypoints: RouteRoadWaypointRepository,
        routePathBuilder: BuildRouteRoadPathService,
      ) => new PlanExistingRouteRoadPathService(waypoints, routePathBuilder),
      inject: [RouteRoadWaypointRepository, BuildRouteRoadPathService],
    },
  ],
  exports: [
    BuildRouteRoadPathService,
    FindRoadPathService,
    PlanExistingRouteRoadPathService,
  ],
})
export class RoutePlanningModule {}
