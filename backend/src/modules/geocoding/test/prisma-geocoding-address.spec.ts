import { PrismaService } from '../../../database/prisma.service';
import { PrismaGeocodingAddress } from '../infrastructure/prisma-geocoding-address';

describe('PrismaGeocodingAddress', () => {
    const tenantId = '10000000-0000-0000-0000-000000000001';
    const addressId = '20000000-0000-0000-0000-000000000001';

    function createFixture() {
        const executeRaw = jest.fn().mockResolvedValue(1);
        const findFirst = jest.fn();

        const transaction = {
            $executeRaw: executeRaw,
            address: {
                findFirst,
            },
        };

        const prisma = {
            $transaction: jest.fn(
                async (callback: (tx: typeof transaction) => Promise<unknown>) =>
                    callback(transaction),
            ),
        } as unknown as PrismaService;

        return {
            executeRaw,
            findFirst,
            repository: new PrismaGeocodingAddress(prisma),
        };
    }

    it('returns null when the address is not visible to the tenant', async () => {
        const { executeRaw, findFirst, repository } = createFixture();

        findFirst.mockResolvedValue(null);

        await expect(
            repository.findByTenant({ tenantId, addressId }),
        ).resolves.toBeNull();

        expect(executeRaw).toHaveBeenCalledTimes(1);

        expect(executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
            findFirst.mock.invocationCallOrder[0],
        );

        expect(findFirst).toHaveBeenCalledWith({
            where: {
                tenantId,
                id: addressId,
            },
            select: {
                id: true,
                tenantId: true,
                originalText: true,
                municipalityCode: true,
            },
        });
    });

    it('returns the tenant-owned address', async () => {
        const { findFirst, repository } = createFixture();

        const address = {
            id: addressId,
            tenantId,
            originalText: 'Calle 80 # 53-67',
            municipalityCode: '08001',
        };

        findFirst.mockResolvedValue(address);

        await expect(
            repository.findByTenant({ tenantId, addressId }),
        ).resolves.toEqual(address);
    });
});