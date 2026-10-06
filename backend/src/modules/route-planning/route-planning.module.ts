import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { BuildRouteRoadPathService } from './application/build-route-road-path.service';
import { ClusterPackagesService } from './application/cluster-packages.service';
import { FindRoadPathService } from './application/find-road-path.service';
import { PlanExistingRouteRoadPathService } from './application/plan-existing-route-road-path.service';
import { DijkstraShortestPath } from './domain/dijkstra-shortest-path';
import { RouteRoadPathRepository } from './domain/route-road-path.repository';
import { RouteRoadWaypointRepository } from './domain/route-road-waypoint.repository';
import { PrismaRoadGraphRepository } from './infrastructure/graph-repository';
import { PrismaRoadPathGeometryRepository } from './infrastructure/path-geometry-repository';
import { PrismaRouteRoadPathRepository } from './infrastructure/route-road-path.repository';
import { PrismaRouteRoadWaypointRepository } from './infrastructure/route-road-waypoint.repository';

import { NearestNeighborOrdering } from './domain/algorithms/nearest-neighbor-ordering';
import { OrderRouteStopsService } from './application/order-route-stops.service';
import { PlanAndAssignRoutesService } from './application/plan-and-assign-routes.service';
import { PrismaPlanningAssignmentUnitOfWork } from './infrastructure/prisma-planning-assignment-unit-of-work';

@Module({
  imports: [PrismaModule],
  providers: [
    PrismaRoadGraphRepository,
    PrismaRoadPathGeometryRepository,
    PrismaRouteRoadPathRepository,
    PrismaRouteRoadWaypointRepository,
    PrismaPlanningAssignmentUnitOfWork,
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
    {
      provide: ClusterPackagesService,
      useFactory: () => new ClusterPackagesService(),
    },
    {
      provide: OrderRouteStopsService,
      useFactory: () =>
        new OrderRouteStopsService(new NearestNeighborOrdering()),
    },
    {
      provide: PlanAndAssignRoutesService,
      useFactory: (
        uow: PrismaPlanningAssignmentUnitOfWork,
        clusterService: ClusterPackagesService,
        orderStopsService: OrderRouteStopsService,
      ) =>
        new PlanAndAssignRoutesService(
          uow,
          clusterService,
          orderStopsService,
        ),
      inject: [
        PrismaPlanningAssignmentUnitOfWork,
        ClusterPackagesService,
        OrderRouteStopsService,
      ],
    },
  ],
  exports: [
    BuildRouteRoadPathService,
    ClusterPackagesService,
    FindRoadPathService,
    OrderRouteStopsService,
    PlanExistingRouteRoadPathService,
    PlanAndAssignRoutesService,
    PrismaPlanningAssignmentUnitOfWork,
  ],
})
export class RoutePlanningModule {}
