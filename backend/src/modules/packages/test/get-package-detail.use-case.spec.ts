import { GetPackageDetailUseCase } from '../application/get-package-detail.use-case';
import { PackageQueryPort } from '../application/ports/package-query.port';
import { PackageNotFoundError } from '../domain/package-errors';

describe('GetPackageDetailUseCase', () => {
    it('returns a package owned by the requested tenant', async () => {
        const detail = { id: 'package-1', trackingCode: 'SLS-2026-10016' };
        const findByTenantAndId = jest.fn().mockResolvedValue(detail);
        const query = { findByTenantAndId } as unknown as PackageQueryPort;
        const useCase = new GetPackageDetailUseCase(query);

        await expect(
            useCase.execute('tenant-a', 'package-1'),
        ).resolves.toEqual(detail);
        expect(findByTenantAndId).toHaveBeenCalledWith(
            'tenant-a',
            'package-1',
        );
    });

    it('returns the same neutral not-found result for absent or foreign packages', async () => {
        const query = {
            findByTenantAndId: jest.fn().mockResolvedValue(null),
        } as unknown as PackageQueryPort;
        const useCase = new GetPackageDetailUseCase(query);

        await expect(
            useCase.execute('tenant-a', 'foreign-package'),
        ).rejects.toBeInstanceOf(PackageNotFoundError);
    });
});
