import { CreateSectorService, type CreateSectorCommand } from '../application/create-sector.service';
import type { CreateSectorResult, SectorCatalogEntry, SectorCatalogPort, } from '../application/ports/sector-catalog.port';
import { InvalidCatalogCodeError } from '../domain/catalog-code';
import { InvalidCatalogNameError } from '../domain/catalog-name';

const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const ZONE_ID = '20000000-0000-4000-8000-000000000001';
const SECTOR_ID = '30000000-0000-4000-8000-000000000001';

function createSectorCommandFixture(
    overrides: Partial<CreateSectorCommand> = {},
): CreateSectorCommand {
    return {
        zoneId: ZONE_ID,
        code: 'SEC-A',
        name: 'Sector A',
        ...overrides,
    };
}

function createSectorFixture(
    overrides: Partial<SectorCatalogEntry> = {},
): SectorCatalogEntry {
    return {
        id: SECTOR_ID,
        tenantId: TENANT_ID,
        zoneId: ZONE_ID,
        code: 'SEC-A',
        name: 'Sector A',
        ...overrides,
    };
}

function createTestContext() {
    const createByTenant = jest.fn<
        ReturnType<SectorCatalogPort['createByTenant']>,
        Parameters<SectorCatalogPort['createByTenant']>
    >();
    const catalog: SectorCatalogPort = {
        listByZone: jest.fn(),
        findByTenant: jest.fn(),
        createByTenant,
    };

    return {
        createByTenant,
        service: new CreateSectorService(catalog),
    };
}

describe('CreateSectorService', () => {
    describe('execute', () => {
        it('creates a sector once with normalized values, zone id, and tenant of operation', async () => {
            const { service, createByTenant } = createTestContext();
            const command = createSectorCommandFixture({
                code: ' sec-a ',
                name: '  Sector norte A  ',
            });
            const created: CreateSectorResult = {
                ok: true,
                sector: createSectorFixture({ name: 'Sector norte A' }),
            };
            createByTenant.mockResolvedValue(created);

            const result = await service.execute(TENANT_ID, command);

            expect(result).toEqual(created);
            expect(createByTenant).toHaveBeenCalledTimes(1);
            expect(createByTenant).toHaveBeenCalledWith(TENANT_ID, {
                zoneId: ZONE_ID,
                code: 'SEC-A',
                name: 'Sector norte A',
            });
        });

        it.each([
            {
                scenario: 'the code is empty',
                overrides: { code: '   ' },
                errorType: InvalidCatalogCodeError,
                errorCode: 'EMPTY_CODE',
                field: 'code',
            },
            {
                scenario: 'the name is empty',
                overrides: { name: '   ' },
                errorType: InvalidCatalogNameError,
                errorCode: 'EMPTY_NAME',
                field: 'name',
            },
        ])(
            'rejects invalid values without writing when $scenario',
            async ({ overrides, errorType, errorCode, field }) => {
                const { service, createByTenant } = createTestContext();
                const command = createSectorCommandFixture(overrides);

                const result = service.execute(TENANT_ID, command);

                await expect(result).rejects.toBeInstanceOf(errorType);
                await expect(result).rejects.toMatchObject({ code: errorCode, field });
                expect(createByTenant).not.toHaveBeenCalled();
            },
        );

        it('returns a code conflict reported by the catalog', async () => {
            const { service, createByTenant } = createTestContext();
            const command = createSectorCommandFixture();
            const conflict: CreateSectorResult = {
                ok: false,
                code: 'CATALOG_CODE_CONFLICT',
            };
            createByTenant.mockResolvedValue(conflict);

            const result = await service.execute(TENANT_ID, command);

            expect(result).toEqual(conflict);
            expect(createByTenant).toHaveBeenCalledTimes(1);
            expect(createByTenant).toHaveBeenCalledWith(TENANT_ID, {
                zoneId: ZONE_ID,
                code: 'SEC-A',
                name: 'Sector A',
            });
        });

        it('returns zone not found reported by the catalog', async () => {
            const { service, createByTenant } = createTestContext();
            const command = createSectorCommandFixture();
            const notFound: CreateSectorResult = {
                ok: false,
                code: 'ZONE_NOT_FOUND',
            };
            createByTenant.mockResolvedValue(notFound);

            const result = await service.execute(TENANT_ID, command);

            expect(result).toEqual(notFound);
            expect(createByTenant).toHaveBeenCalledTimes(1);
            expect(createByTenant).toHaveBeenCalledWith(TENANT_ID, {
                zoneId: ZONE_ID,
                code: 'SEC-A',
                name: 'Sector A',
            });
        });

        it('propagates the original infrastructure error from the catalog', async () => {
            const { service, createByTenant } = createTestContext();
            const command = createSectorCommandFixture();
            const infrastructureError = new Error('Database unavailable');
            createByTenant.mockRejectedValue(infrastructureError);

            const result = service.execute(TENANT_ID, command);

            await expect(result).rejects.toBe(infrastructureError);
            expect(createByTenant).toHaveBeenCalledTimes(1);
        });
    });
});