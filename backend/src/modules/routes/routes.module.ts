import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { PrismaRouteRepository } from './infrastructure/persistence/prisma-route.repository';
import { PrismaRouteLifecycleUnitOfWork } from './infrastructure/persistence/prisma-route-lifecycle-unit-of-work';
import { PrismaRouteResourcesAdapter } from './infrastructure/persistence/prisma-route-resources.adapter';
import { AuthRouteAccessAdapter } from './infrastructure/authorization/auth-route-access.adapter';
import { ListRoutesUseCase } from './application/use-cases/list-routes.use-case';
import { GetRouteDetailUseCase } from './application/use-cases/get-route-detail.use-case';
import { PrepareRouteUseCase } from './application/use-cases/prepare-route.use-case';
import { StartRouteUseCase } from './application/use-cases/start-route.use-case';
import { CancelRouteUseCase } from './application/use-cases/cancel-route.use-case';
import { InterruptRouteUseCase } from './application/use-cases/interrupt-route.use-case';
import { PrismaRouteCloseUnitOfWork } from './infrastructure/persistence/prisma-route-close-unit-of-work';
import { PrismaRouteSummaryReader } from './infrastructure/persistence/prisma-route-summary-reader';
import { CloseRouteUseCase } from './application/use-cases/close-route.use-case';
import { GetRouteSummaryUseCase } from './application/use-cases/get-route-summary.use-case';
import { RoutesController } from './presentation/routes.controller';

@Module({
  imports: [PrismaModule],
  controllers: [RoutesController],
  providers: [
    PrismaRouteRepository,
    PrismaRouteLifecycleUnitOfWork,
    PrismaRouteCloseUnitOfWork,
    PrismaRouteSummaryReader,
    PrismaRouteResourcesAdapter,
    AuthRouteAccessAdapter,
    {
      provide: ListRoutesUseCase,
      useFactory: (
        routeRepository: PrismaRouteRepository,
        accessPort: AuthRouteAccessAdapter,
      ) => new ListRoutesUseCase(routeRepository, accessPort),
      inject: [PrismaRouteRepository, AuthRouteAccessAdapter],
    },
    {
      provide: GetRouteDetailUseCase,
      useFactory: (
        routeRepository: PrismaRouteRepository,
        accessPort: AuthRouteAccessAdapter,
      ) => new GetRouteDetailUseCase(routeRepository, accessPort),
      inject: [PrismaRouteRepository, AuthRouteAccessAdapter],
    },
    {
      provide: PrepareRouteUseCase,
      useFactory: (
        unitOfWork: PrismaRouteLifecycleUnitOfWork,
        accessPort: AuthRouteAccessAdapter,
        resourcesPort: PrismaRouteResourcesAdapter,
      ) => new PrepareRouteUseCase(unitOfWork, accessPort, resourcesPort),
      inject: [
        PrismaRouteLifecycleUnitOfWork,
        AuthRouteAccessAdapter,
        PrismaRouteResourcesAdapter,
      ],
    },
    {
      provide: StartRouteUseCase,
      useFactory: (
        unitOfWork: PrismaRouteLifecycleUnitOfWork,
        accessPort: AuthRouteAccessAdapter,
        resourcesPort: PrismaRouteResourcesAdapter,
      ) => new StartRouteUseCase(unitOfWork, accessPort, resourcesPort),
      inject: [
        PrismaRouteLifecycleUnitOfWork,
        AuthRouteAccessAdapter,
        PrismaRouteResourcesAdapter,
      ],
    },
    {
      provide: CancelRouteUseCase,
      useFactory: (
        unitOfWork: PrismaRouteLifecycleUnitOfWork,
        accessPort: AuthRouteAccessAdapter,
      ) => new CancelRouteUseCase(unitOfWork, accessPort),
      inject: [PrismaRouteLifecycleUnitOfWork, AuthRouteAccessAdapter],
    },
    {
      provide: InterruptRouteUseCase,
      useFactory: (
        unitOfWork: PrismaRouteLifecycleUnitOfWork,
        accessPort: AuthRouteAccessAdapter,
      ) => new InterruptRouteUseCase(unitOfWork, accessPort),
      inject: [PrismaRouteLifecycleUnitOfWork, AuthRouteAccessAdapter],
    },
    {
      provide: CloseRouteUseCase,
      useFactory: (
        unitOfWork: PrismaRouteCloseUnitOfWork,
        accessPort: AuthRouteAccessAdapter,
      ) => new CloseRouteUseCase(unitOfWork, accessPort),
      inject: [PrismaRouteCloseUnitOfWork, AuthRouteAccessAdapter],
    },
    {
      provide: GetRouteSummaryUseCase,
      useFactory: (
        routeRepository: PrismaRouteRepository,
        summaryReader: PrismaRouteSummaryReader,
        accessPort: AuthRouteAccessAdapter,
      ) =>
        new GetRouteSummaryUseCase(
          routeRepository,
          summaryReader,
          accessPort,
        ),
      inject: [
        PrismaRouteRepository,
        PrismaRouteSummaryReader,
        AuthRouteAccessAdapter,
      ],
    },
  ],
  exports: [
    ListRoutesUseCase,
    GetRouteDetailUseCase,
    PrepareRouteUseCase,
    StartRouteUseCase,
    CancelRouteUseCase,
    InterruptRouteUseCase,
    CloseRouteUseCase,
    GetRouteSummaryUseCase,
    PrismaRouteRepository,
    PrismaRouteLifecycleUnitOfWork,
    PrismaRouteCloseUnitOfWork,
    PrismaRouteSummaryReader,
  ],
})
export class RoutesModule {}
