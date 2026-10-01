import { GeocodeAddressService } from '../application/geocode-address.service';
import type { GeocodingAddressPort } from '../application/ports/geocoding-address.port';
import type { GeocodingAttemptPort } from '../application/ports/geocoding-attempt.port';
import type { GeocodingCatalogPort } from '../application/ports/geocoding-catalog.port';
import type { GeocodingReference } from '../domain/geocoding.types';

describe('GeocodeAddressService', () => {
    const tenantId = '10000000-0000-0000-0000-000000000001';
    const addressId = '20000000-0000-0000-0000-000000000001';
    const datasetId = '30000000-0000-0000-0000-000000000001';

    const command = {
        tenantId,
        addressId,
        datasetId,
    };

    const address = {
        id: addressId,
        tenantId,
        originalText: 'Calle 80 # 53-67',
        municipalityCode: '08001',
    };

    const exactReference: GeocodingReference = {
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
    };

    function createFixture() {
        const findByTenant = jest.fn();
        const findCandidates = jest.fn();
        const saveAtomically = jest.fn();

        const addresses: GeocodingAddressPort = {
            findByTenant,
        };

        const catalog: GeocodingCatalogPort = {
            findCandidates,
        };

        const attempts: GeocodingAttemptPort = {
            saveAtomically,
        };

        return {
            findByTenant,
            findCandidates,
            saveAtomically,
            service: new GeocodeAddressService(addresses, catalog, attempts),
        };
    }

    it('returns ADDRESS_NOT_FOUND without querying the catalog', async () => {
        const fixture = createFixture();

        fixture.findByTenant.mockResolvedValue(null);

        await expect(fixture.service.execute(command)).resolves.toEqual({
            kind: 'ADDRESS_NOT_FOUND',
        });

        expect(fixture.findByTenant).toHaveBeenCalledWith({
            tenantId,
            addressId,
        });

        expect(fixture.findCandidates).not.toHaveBeenCalled();
        expect(fixture.saveAtomically).not.toHaveBeenCalled();
    });

    it('returns DATASET_NOT_READY without persisting an attempt', async () => {
        const fixture = createFixture();

        fixture.findByTenant.mockResolvedValue(address);
        fixture.findCandidates.mockResolvedValue(null);

        await expect(fixture.service.execute(command)).resolves.toEqual({
            kind: 'DATASET_NOT_READY',
        });

        expect(fixture.findCandidates).toHaveBeenCalledWith({
            datasetId,
            municipalityCode: '08001',
            searchKeyPrefix: 'CALLE|80',
            limit: 20,
        });

        expect(fixture.saveAtomically).not.toHaveBeenCalled();
    });

    it('persists and returns an automatic match', async () => {
        const fixture = createFixture();

        fixture.findByTenant.mockResolvedValue(address);
        fixture.findCandidates.mockResolvedValue({
            datasetId,
            references: [exactReference],
        });
        fixture.saveAtomically.mockResolvedValue({
            attemptId: '50000000-0000-0000-0000-000000000001',
        });

        const result = await fixture.service.execute(command);

        expect(result).toMatchObject({
            kind: 'COMPLETED',
            attemptId: '50000000-0000-0000-0000-000000000001',
            decision: {
                status: 'MATCHED',
                selectedReferenceId: exactReference.referenceId,
            },
        });

        expect(fixture.saveAtomically).toHaveBeenCalledWith({
            tenantId,
            addressId,
            datasetId,
            decision: expect.objectContaining({
                status: 'MATCHED',
                selectedReferenceId: exactReference.referenceId,
            }),
        });
    });

    it('persists NOT_FOUND as an expected business result', async () => {
        const fixture = createFixture();

        fixture.findByTenant.mockResolvedValue(address);
        fixture.findCandidates.mockResolvedValue({
            datasetId,
            references: [],
        });
        fixture.saveAtomically.mockResolvedValue({
            attemptId: '50000000-0000-0000-0000-000000000002',
        });

        const result = await fixture.service.execute(command);

        expect(result).toMatchObject({
            kind: 'COMPLETED',
            attemptId: '50000000-0000-0000-0000-000000000002',
            decision: {
                status: 'NOT_FOUND',
                selectedReferenceId: null,
                candidates: [],
            },
        });

        expect(fixture.saveAtomically).toHaveBeenCalledTimes(1);
    });
});