import { PrismaService } from '../../../database/prisma.service';
import { FindGeocodingCandidatesQuery } from '../application/ports/geocoding-catalog.port';
import { PrismaGeocodingCatalog } from '../infrastructure/prisma-geocoding-catalog';

describe('PrismaGeocodingCatalog', () => {
    const datasetId = '30000000-0000-0000-0000-000000000001';

    const query: FindGeocodingCandidatesQuery = {
        datasetId,
        municipalityCode: '08001',
        searchKeyPrefix: 'CALLE|80',
        limit: 20,
    };

    function createFixture() {
        const transaction = {
            geoDataset: {
                findFirst: jest.fn(),
            },
            $queryRaw: jest.fn(),
        };

        const prisma = {
            $transaction: jest.fn(
                async (callback: (tx: typeof transaction) => Promise<unknown>) =>
                    callback(transaction),
            ),
        } as unknown as PrismaService;

        return {
            prisma,
            transaction,
            catalog: new PrismaGeocodingCatalog(prisma),
        };
    }

    it('returns null when the dataset is not READY', async () => {
        const { catalog, transaction } = createFixture();

        transaction.geoDataset.findFirst.mockResolvedValue(null);

        await expect(catalog.findCandidates(query)).resolves.toBeNull();

        expect(transaction.geoDataset.findFirst).toHaveBeenCalledWith({
            where: {
                id: datasetId,
                status: 'READY',
            },
            select: {
                id: true,
            },
        });

        expect(transaction.$queryRaw).not.toHaveBeenCalled();
    });

    it('returns an empty catalog when the READY dataset has no candidates', async () => {
        const { catalog, transaction } = createFixture();

        transaction.geoDataset.findFirst.mockResolvedValue({
            id: datasetId,
        });

        transaction.$queryRaw.mockResolvedValue([]);

        await expect(catalog.findCandidates(query)).resolves.toEqual({
            datasetId,
            references: [],
        });

        expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('maps database rows to domain geocoding references', async () => {
        const { catalog, transaction } = createFixture();

        transaction.geoDataset.findFirst.mockResolvedValue({
            id: datasetId,
        });

        transaction.$queryRaw.mockResolvedValue([
            {
                referenceId: '40000000-0000-0000-0000-000000000001',
                datasetId,
                municipalityCode: '08001',
                normalizedAddress: 'CALLE 80 # 53-67',
                streetType: 'CALLE',
                streetIdentifier: '80',
                generatingRoad: '53',
                plateNumber: '67',
                neighborhood: null,
                precision: 'ENTRANCE',
                latitude: 11.0132,
                longitude: -74.8271,
            },
        ]);

        await expect(catalog.findCandidates(query)).resolves.toEqual({
            datasetId,
            references: [
                {
                    referenceId: '40000000-0000-0000-0000-000000000001',
                    datasetId,
                    municipalityCode: '08001',
                    normalizedAddress: 'CALLE 80 # 53-67',
                    components: {
                        streetType: 'CALLE',
                        streetIdentifier: '80',
                        generatingRoad: '53',
                        plateNumber: '67',
                        neighborhood: null,
                    },
                    precision: 'ENTRANCE',
                    latitude: 11.0132,
                    longitude: -74.8271,
                },
            ],
        });
    });

    it('passes the filters and limit through a deterministic SQL query', async () => {
        const { catalog, transaction } = createFixture();

        transaction.geoDataset.findFirst.mockResolvedValue({
            id: datasetId,
        });

        transaction.$queryRaw.mockResolvedValue([]);

        await catalog.findCandidates(query);

        const sql = transaction.$queryRaw.mock.calls[0][0] as {
            readonly strings: readonly string[];
            readonly values: readonly unknown[];
        };

        expect(sql.values).toEqual([
            datasetId,
            query.municipalityCode,
            query.searchKeyPrefix,
            `${query.searchKeyPrefix}|%`,
            query.limit,
        ]);

        const statement = sql.strings.join(' ');

        expect(statement).toContain('reference."searchKey" =');
        expect(statement).toContain('reference."searchKey" LIKE');
        expect(statement).toContain('ORDER BY reference."id" ASC');
        expect(statement).toContain('LIMIT');
    });
});