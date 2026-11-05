import { ClassifyPackageService } from '../application/classify-package.service';
import type {
    PackageClassificationContext,
    PackageClassificationPort,
} from '../application/ports/package-classification.port';
import { InvalidPackageRegistrationError } from '../domain/invalid-package-registration.error';
import { InvalidPackageTransitionError } from '../domain/invalid-package-transition.error';
import { PackageNotFoundError } from '../domain/package-errors';
import { PackageAggregate } from '../domain/package.aggregate';
import { PackageStatus } from '../domain/package-state.types';

const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const USER_ID = '20000000-0000-4000-8000-000000000001';
const CORRELATION_ID = '30000000-0000-4000-8000-000000000001';
const PACKAGE_ID = '40000000-0000-4000-8000-000000000001';
const ZONE_ID = '60000000-0000-4000-8000-000000000001';
const OTHER_ZONE_ID = '60000000-0000-4000-8000-000000000002';
const SECTOR_ID = '70000000-0000-4000-8000-000000000001';

const context: PackageClassificationContext = {
    tenantId: TENANT_ID,
    actorUserId: USER_ID,
    correlationId: CORRELATION_ID,
};

function createFixture() {
    const loadClassificationReferences = jest.fn();
    const classifyAtomically = jest.fn();

    const port: PackageClassificationPort = {
        loadClassificationReferences,
        classifyAtomically,
    };

    return {
        loadClassificationReferences,
        classifyAtomically,
        service: new ClassifyPackageService(port),
    };
}

describe('ClassifyPackageService', () => {
    it('classifies a REGISTERED package with valid zone and sector', async () => {
        const { service, loadClassificationReferences, classifyAtomically } =
            createFixture();
        loadClassificationReferences.mockResolvedValue({
            zone: { id: ZONE_ID },
            sector: { zoneId: ZONE_ID },
        });
        classifyAtomically.mockImplementation(
            async (_ctx, _pkgId, data, operation) => {
                const aggregate = PackageAggregate.reconstitute({
                    id: PACKAGE_ID,
                    tenantId: TENANT_ID,
                    state: PackageStatus.REGISTERED,
                });
                operation(aggregate);
                return {
                    ok: true,
                    package: {
                        id: PACKAGE_ID,
                        tenantId: TENANT_ID,
                        trackingCode: 'PKG-0001',
                        state: aggregate.state,
                        zoneId: data.zoneId,
                        sectorId: data.sectorId,
                    },
                };
            },
        );

        const result = await service.execute(context, PACKAGE_ID, {
            zoneId: ZONE_ID,
            sectorId: SECTOR_ID,
        });

        expect(result).toEqual({
            ok: true,
            package: {
                id: PACKAGE_ID,
                tenantId: TENANT_ID,
                trackingCode: 'PKG-0001',
                state: 'CLASSIFIED',
                zoneId: ZONE_ID,
                sectorId: SECTOR_ID,
            },
        });
    });

    it('rejects missing zoneId with InvalidPackageRegistrationError', async () => {
        const { service } = createFixture();

        await expect(
            service.execute(context, PACKAGE_ID, {}),
        ).rejects.toBeInstanceOf(InvalidPackageRegistrationError);
    });

    it('throws PackageNotFoundError when packageId is not a valid UUID', async () => {
        const { service } = createFixture();

        await expect(
            service.execute(context, 'not-a-uuid', { zoneId: ZONE_ID }),
        ).rejects.toBeInstanceOf(PackageNotFoundError);
    });

    it('returns PACKAGE_ZONE_NOT_FOUND when zone does not belong to tenant', async () => {
        const { service, loadClassificationReferences } = createFixture();
        loadClassificationReferences.mockResolvedValue({
            zone: null,
            sector: null,
        });

        await expect(
            service.execute(context, PACKAGE_ID, { zoneId: ZONE_ID }),
        ).resolves.toEqual({
            ok: false,
            code: 'PACKAGE_ZONE_NOT_FOUND',
        });
    });

    it('returns PACKAGE_SECTOR_ZONE_MISMATCH when sector belongs to another zone', async () => {
        const { service, loadClassificationReferences } = createFixture();
        loadClassificationReferences.mockResolvedValue({
            zone: { id: ZONE_ID },
            sector: { zoneId: OTHER_ZONE_ID },
        });

        await expect(
            service.execute(context, PACKAGE_ID, {
                zoneId: ZONE_ID,
                sectorId: SECTOR_ID,
            }),
        ).resolves.toEqual({
            ok: false,
            code: 'PACKAGE_SECTOR_ZONE_MISMATCH',
        });
    });

    it('throws InvalidPackageTransitionError when package is not REGISTERED', async () => {
        const { service, loadClassificationReferences, classifyAtomically } =
            createFixture();
        loadClassificationReferences.mockResolvedValue({
            zone: { id: ZONE_ID },
            sector: null,
        });
        classifyAtomically.mockImplementation(
            async (_ctx, _pkgId, _data, operation) => {
                const aggregate = PackageAggregate.reconstitute({
                    id: PACKAGE_ID,
                    tenantId: TENANT_ID,
                    state: PackageStatus.CLASSIFIED,
                });
                operation(aggregate);
                return { ok: false, code: 'PACKAGE_NOT_FOUND' };
            },
        );

        await expect(
            service.execute(context, PACKAGE_ID, { zoneId: ZONE_ID }),
        ).rejects.toBeInstanceOf(InvalidPackageTransitionError);
    });
});
