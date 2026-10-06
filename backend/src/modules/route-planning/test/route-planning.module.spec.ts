import { Test } from '@nestjs/testing';
import { BuildRouteRoadPathService } from '../application/build-route-road-path.service';
import { FindRoadPathService } from '../application/find-road-path.service';
import { PlanExistingRouteRoadPathService } from '../application/plan-existing-route-road-path.service';
import { PlanAndAssignRoutesService } from '../application/plan-and-assign-routes.service';
import { OrderRouteStopsService } from '../application/order-route-stops.service';
import { PrismaPlanningAssignmentUnitOfWork } from '../infrastructure/prisma-planning-assignment-unit-of-work';
import { RoutePlanningModule } from '../route-planning.module';

describe('RoutePlanningModule', () => {
  it('exposes route calculation and persistence services', async () => {
    const testingModule = await Test.createTestingModule({
      imports: [RoutePlanningModule],
    }).compile();

    expect(testingModule.get(FindRoadPathService)).toBeInstanceOf(
      FindRoadPathService,
    );
    expect(testingModule.get(BuildRouteRoadPathService)).toBeInstanceOf(
      BuildRouteRoadPathService,
    );
    expect(testingModule.get(PlanExistingRouteRoadPathService)).toBeInstanceOf(
      PlanExistingRouteRoadPathService,
    );
    expect(testingModule.get(OrderRouteStopsService)).toBeInstanceOf(
      OrderRouteStopsService,
    );
    expect(testingModule.get(PlanAndAssignRoutesService)).toBeInstanceOf(
      PlanAndAssignRoutesService,
    );
    expect(testingModule.get(PrismaPlanningAssignmentUnitOfWork)).toBeInstanceOf(
      PrismaPlanningAssignmentUnitOfWork,
    );

    await testingModule.close();
  });
});
