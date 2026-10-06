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
import { RoutesController } from './presentation/routes.controller';

@Module({
  imports: [PrismaModule],
  controllers: [RoutesController],
  providers: [
    PrismaRouteRepository,
    PrismaRouteLifecycleUnitOfWork,
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
  ],
  exports: [
    ListRoutesUseCase,
    GetRouteDetailUseCase,
    PrepareRouteUseCase,
    StartRouteUseCase,
    CancelRouteUseCase,
    InterruptRouteUseCase,
    PrismaRouteRepository,
    PrismaRouteLifecycleUnitOfWork,
  ],
})
export class RoutesModule {}
