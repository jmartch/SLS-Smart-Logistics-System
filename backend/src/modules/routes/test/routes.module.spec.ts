import { Test } from '@nestjs/testing';
import { RoutesModule } from '../routes.module';
import { RoutesController } from '../presentation/routes.controller';
import { ListRoutesUseCase } from '../application/use-cases/list-routes.use-case';
import { GetRouteDetailUseCase } from '../application/use-cases/get-route-detail.use-case';
import { PrepareRouteUseCase } from '../application/use-cases/prepare-route.use-case';
import { StartRouteUseCase } from '../application/use-cases/start-route.use-case';
import { CancelRouteUseCase } from '../application/use-cases/cancel-route.use-case';
import { InterruptRouteUseCase } from '../application/use-cases/interrupt-route.use-case';
import { PrismaRouteRepository } from '../infrastructure/persistence/prisma-route.repository';
import { PrismaRouteLifecycleUnitOfWork } from '../infrastructure/persistence/prisma-route-lifecycle-unit-of-work';

describe('RoutesModule', () => {
  it('exposes routes lifecycle use cases and controller', async () => {
    // Arrange & Act
    const testingModule = await Test.createTestingModule({
      imports: [RoutesModule],
    }).compile();

    // Assert
    expect(testingModule.get(RoutesController)).toBeInstanceOf(
      RoutesController,
    );
    expect(testingModule.get(ListRoutesUseCase)).toBeInstanceOf(
      ListRoutesUseCase,
    );
    expect(testingModule.get(GetRouteDetailUseCase)).toBeInstanceOf(
      GetRouteDetailUseCase,
    );
    expect(testingModule.get(PrepareRouteUseCase)).toBeInstanceOf(
      PrepareRouteUseCase,
    );
    expect(testingModule.get(StartRouteUseCase)).toBeInstanceOf(
      StartRouteUseCase,
    );
    expect(testingModule.get(CancelRouteUseCase)).toBeInstanceOf(
      CancelRouteUseCase,
    );
    expect(testingModule.get(InterruptRouteUseCase)).toBeInstanceOf(
      InterruptRouteUseCase,
    );
    expect(testingModule.get(PrismaRouteRepository)).toBeInstanceOf(
      PrismaRouteRepository,
    );
    expect(testingModule.get(PrismaRouteLifecycleUnitOfWork)).toBeInstanceOf(
      PrismaRouteLifecycleUnitOfWork,
    );

    await testingModule.close();
  });
});
