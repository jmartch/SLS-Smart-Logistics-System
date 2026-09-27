import { Test } from '@nestjs/testing';
import { TransitionPackageStateService } from '../application/transition-package-state.service';
import { PackagesModule } from '../packages.module';

describe('PackagesModule', () => {
    it('exposes the package lifecycle application service', async () => {
        const testingModule = await Test.createTestingModule({
            imports: [PackagesModule],
        }).compile();

        const service = testingModule.get(TransitionPackageStateService);

        expect(service).toBeInstanceOf(TransitionPackageStateService);

        await testingModule.close();
    });
});