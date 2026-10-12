import { ListPackagesUseCase } from '../application/list-packages.use-case';
import { PackageQueryPort } from '../application/ports/package-query.port';

describe('ListPackagesUseCase', () => {
    it('delegates the tenant-scoped query to its port', async () => {
        const packages = [
            {
                id: 'package-1',
                trackingCode: 'SLS-2026-10016',
                state: 'REGISTERED',
                priority: 'NORMAL',
                weightKg: '2.5',
                volumeM3: '0.009',
                address: 'Cra 54 # 72-80',
                zone: 'Zona Norte',
                sector: 'Sector A',
                shipmentType: 'Estándar',
                registeredAt: new Date('2026-10-11T20:00:00.000Z'),
            },
        ];
        const listByTenant = jest.fn().mockResolvedValue(packages);
        const query = { listByTenant } as unknown as PackageQueryPort;
        const useCase = new ListPackagesUseCase(query);

        await expect(useCase.execute('tenant-a')).resolves.toEqual(packages);
        expect(listByTenant).toHaveBeenCalledWith('tenant-a');
    });
});
