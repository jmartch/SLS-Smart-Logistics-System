import type { PrismaService } from '../../../database/prisma.service';
import type { GeocodeAddressService } from '../../geocoding/application/geocode-address.service';
import { InvalidAddressError } from '../../geocoding/domain/invalid-address.error';
import { PrismaPackageGeocodingAdapter } from '../infrastructure/prisma-package-geocoding.adapter';

const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const PACKAGE_ID = '20000000-0000-4000-8000-000000000001';
const ADDRESS_ID = '30000000-0000-4000-8000-000000000001';
const DATASET_ID = '40000000-0000-4000-8000-000000000001';
const ATTEMPT_ID = '50000000-0000-4000-8000-000000000001';
const CANDIDATE_ID = '60000000-0000-4000-8000-000000000001';

function createFixture() {
    const tx = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        package: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        geocodingAttempt: {
            findFirst: jest.fn().mockResolvedValue({
                selectedCandidateId: CANDIDATE_ID,
            }),
        },
    };

    const prisma = {
        geoDataset: {
            findFirst: jest.fn().mockResolvedValue({ id: DATASET_ID }),
        },
        $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
            callback(tx),
        ),
    } as unknown as PrismaService;

    const geocodeAddress = {
        execute: jest.fn(),
    } as unknown as GeocodeAddressService;

    const adapter = new PrismaPackageGeocodingAdapter(prisma, geocodeAddress);

    return { adapter, prisma, tx, geocodeAddress };
}

describe('PrismaPackageGeocodingAdapter', () => {
    it('does nothing when no READY GeoDataset exists', async () => {
        const { adapter, prisma, geocodeAddress } = createFixture();
        (prisma.geoDataset.findFirst as jest.Mock).mockResolvedValue(null);

        await adapter.geocodeAndAttach({
            tenantId: TENANT_ID,
            packageId: PACKAGE_ID,
            addressId: ADDRESS_ID,
        });

        expect(geocodeAddress.execute).not.toHaveBeenCalled();
    });

    it('swallows InvalidAddressError so manual registration still succeeds', async () => {
        const { adapter, geocodeAddress, tx } = createFixture();
        (geocodeAddress.execute as jest.Mock).mockRejectedValue(
            new InvalidAddressError('UNSUPPORTED_ADDRESS_FORMAT', 'bad format'),
        );

        await expect(
            adapter.geocodeAndAttach({
                tenantId: TENANT_ID,
                packageId: PACKAGE_ID,
                addressId: ADDRESS_ID,
            }),
        ).resolves.toBeUndefined();

        expect(tx.package.updateMany).not.toHaveBeenCalled();
    });

    it('links geocodingAttemptId and inserts NetworkAttachment when MATCHED', async () => {
        const { adapter, geocodeAddress, tx } = createFixture();
        (geocodeAddress.execute as jest.Mock).mockResolvedValue({
            kind: 'COMPLETED',
            attemptId: ATTEMPT_ID,
            decision: {
                status: 'MATCHED',
                normalizedText: 'CALLE 72 # 45-10',
                components: {},
                algorithmVersion: 'geocode-v1',
                candidates: [],
                selectedReferenceId: 'ref-1',
            },
        });

        await adapter.geocodeAndAttach({
            tenantId: TENANT_ID,
            packageId: PACKAGE_ID,
            addressId: ADDRESS_ID,
        });

        expect(geocodeAddress.execute).toHaveBeenCalledWith({
            tenantId: TENANT_ID,
            addressId: ADDRESS_ID,
            datasetId: DATASET_ID,
        });
        expect(tx.package.updateMany).toHaveBeenCalledWith({
            where: { tenantId: TENANT_ID, id: PACKAGE_ID },
            data: { geocodingAttemptId: ATTEMPT_ID },
        });
        // 1st $executeRaw is set_config(app.tenant_id), 2nd is INSERT INTO "NetworkAttachment"
        expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    });

    it('links geocodingAttemptId without inserting NetworkAttachment when NOT_FOUND', async () => {
        const { adapter, geocodeAddress, tx } = createFixture();
        (geocodeAddress.execute as jest.Mock).mockResolvedValue({
            kind: 'COMPLETED',
            attemptId: ATTEMPT_ID,
            decision: {
                status: 'NOT_FOUND',
                normalizedText: 'CALLE 999 # 1-1',
                components: {},
                algorithmVersion: 'geocode-v1',
                candidates: [],
                selectedReferenceId: null,
            },
        });

        await adapter.geocodeAndAttach({
            tenantId: TENANT_ID,
            packageId: PACKAGE_ID,
            addressId: ADDRESS_ID,
        });

        expect(tx.package.updateMany).toHaveBeenCalledWith({
            where: { tenantId: TENANT_ID, id: PACKAGE_ID },
            data: { geocodingAttemptId: ATTEMPT_ID },
        });
        // Only set_config(app.tenant_id), no NetworkAttachment insert
        expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    });
});
