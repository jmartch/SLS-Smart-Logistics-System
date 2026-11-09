import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
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
import { GetPlanningWorkspaceService } from './application/get-planning-workspace.service';
import { OrderRouteStopsService } from './application/order-route-stops.service';
import { PlanAndAssignRoutesService } from './application/plan-and-assign-routes.service';
import { ReplanEditableRouteService } from './application/replan-editable-route.service';
import { PlanningWorkspaceQueryPort } from './application/ports/planning-workspace-query.port';
import { EditableRouteReplanUnitOfWork } from './application/ports/replan-editable-route.contract';
import { PrismaPlanningAssignmentUnitOfWork } from './infrastructure/prisma-planning-assignment-unit-of-work';
import { PrismaEditableRouteReplanUnitOfWork } from './infrastructure/prisma-editable-route-replan.uow';
import { PrismaPlanningWorkspaceQueryAdapter } from './infrastructure/prisma-planning-workspace-query.adapter';
import { PackageGeocodingConfigAdapter } from '../../config/package-geocoding.config';

import { RoutePlanningController } from './presentation/route-planning.controller';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [RoutePlanningController],
  providers: [
    PrismaRoadGraphRepository,
    PrismaRoadPathGeometryRepository,
    PrismaRouteRoadPathRepository,
    PrismaRouteRoadWaypointRepository,
    PrismaPlanningAssignmentUnitOfWork,
    PrismaEditableRouteReplanUnitOfWork,
    PrismaPlanningWorkspaceQueryAdapter,
    {
      provide: RouteRoadPathRepository,
      useExisting: PrismaRouteRoadPathRepository,
    },
    {
      provide: RouteRoadWaypointRepository,
      useExisting: PrismaRouteRoadWaypointRepository,
    },
    {
      provide: PlanningWorkspaceQueryPort,
      useExisting: PrismaPlanningWorkspaceQueryAdapter,
    },
    {
      provide: EditableRouteReplanUnitOfWork,
      useExisting: PrismaEditableRouteReplanUnitOfWork,
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
        new PlanAndAssignRoutesService(uow, clusterService, orderStopsService),
      inject: [
        PrismaPlanningAssignmentUnitOfWork,
        ClusterPackagesService,
        OrderRouteStopsService,
      ],
    },
    {
      provide: ReplanEditableRouteService,
      useFactory: (
        uow: EditableRouteReplanUnitOfWork,
        orderStopsService: OrderRouteStopsService,
      ) => new ReplanEditableRouteService(uow, orderStopsService),
      inject: [EditableRouteReplanUnitOfWork, OrderRouteStopsService],
    },
    PackageGeocodingConfigAdapter,
    {
      provide: GetPlanningWorkspaceService,
      useFactory: (
        workspaceQuery: PlanningWorkspaceQueryPort,
        configPort: PackageGeocodingConfigAdapter,
      ) => new GetPlanningWorkspaceService(workspaceQuery, configPort),
      inject: [PlanningWorkspaceQueryPort, PackageGeocodingConfigAdapter],
    },
  ],
  exports: [
    BuildRouteRoadPathService,
    ClusterPackagesService,
    FindRoadPathService,
    GetPlanningWorkspaceService,
    OrderRouteStopsService,
    PlanExistingRouteRoadPathService,
    PlanAndAssignRoutesService,
    ReplanEditableRouteService,
    PrismaPlanningAssignmentUnitOfWork,
  ],
})
export class RoutePlanningModule {}
