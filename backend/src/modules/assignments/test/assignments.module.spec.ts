import { Test } from '@nestjs/testing';
import { AssignPackageToRouteService } from '../application/assign-package-to-route.service';
import { AssignmentsModule } from '../assignments.module';

describe('AssignmentsModule', () => {
    it('exposes the assignment application service', async () => {
        const testingModule = await Test.createTestingModule({
            imports: [AssignmentsModule],
        }).compile();

        const service = testingModule.get(AssignPackageToRouteService);

        expect(service).toBeInstanceOf(AssignPackageToRouteService);

        await testingModule.close();
    });
});
