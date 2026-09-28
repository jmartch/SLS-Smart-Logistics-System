import { Test } from '@nestjs/testing';
import { BuildRouteRoadPathService } from '../application/build-route-road-path.service';
import { FindRoadPathService } from '../application/find-road-path.service';
import { PlanExistingRouteRoadPathService } from '../application/plan-existing-route-road-path.service';
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

    await testingModule.close();
  });
});
