import type { PackageRegistrationPort } from '../application/ports/package-registration.port';
import type { PublicTrackingTokenGenerator } from '../application/ports/public-tracking-token.port';
import { RegisterPackageService } from '../application/register-package.service';
import { InvalidPackageRegistrationError } from '../domain/invalid-package-registration.error';

const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const SHIPMENT_TYPE_ID = '50000000-0000-4000-8000-000000000001';
const ZONE_ID = '60000000-0000-4000-8000-000000000001';

function input(overrides: Record<string, unknown> = {}) {
    return {
        trackingCode: 'PKG-0001',
        address: { text: 'Calle 72 # 45-10', municipalityCode: '08001' },
        shipmentTypeId: SHIPMENT_TYPE_ID,
        weightKg: 2.5,
        lengthCm: 30,
        widthCm: 20,
        heightCm: 10,
        ...overrides,
    };
}

function createFixture() {
    const loadReferences = jest.fn();
    const registerByTenant = jest.fn();
    const generate = jest.fn().mockReturnValue('token-publico');
    const registration: PackageRegistrationPort = {
        loadReferences,
        registerByTenant,
    };
    const tokens: PublicTrackingTokenGenerator = { generate };

    return {
        loadReferences,
        registerByTenant,
        generate,
        service: new RegisterPackageService(registration, tokens),
    };
}

describe('RegisterPackageService', () => {
    it('validates references, generates a token and registers atomically', async () => {
        const { loadReferences, registerByTenant, generate, service } =
            createFixture();
        loadReferences.mockResolvedValue({
            shipmentType: { active: true },
            zone: { id: ZONE_ID },
            sector: null,
        });
        const outcome = { ok: true as const, package: { id: 'p1' } as never };
        registerByTenant.mockResolvedValue(outcome);

        const result = await service.execute(
            TENANT_ID,
            input({ zoneId: ZONE_ID }),
        );

        expect(loadReferences).toHaveBeenCalledWith(TENANT_ID, {
            shipmentTypeId: SHIPMENT_TYPE_ID,
            zoneId: ZONE_ID,
            sectorId: null,
        });
        expect(generate).toHaveBeenCalledTimes(1);
        expect(registerByTenant).toHaveBeenCalledWith(
            TENANT_ID,
            expect.objectContaining({
                trackingCode: 'PKG-0001',
                volumeM3: '0.006',
                initialState: 'REGISTERED',
            }),
            'token-publico',
        );
        expect(result).toBe(outcome);
    });

    it('does not persist or generate a token when a reference is invalid', async () => {
        const { loadReferences, registerByTenant, generate, service } =
            createFixture();
        loadReferences.mockResolvedValue({
            shipmentType: null,
            zone: null,
            sector: null,
        });

        const result = await service.execute(TENANT_ID, input());

        expect(result).toEqual({
            ok: false,
            code: 'PACKAGE_SHIPMENT_TYPE_NOT_FOUND',
        });
        expect(registerByTenant).not.toHaveBeenCalled();
        expect(generate).not.toHaveBeenCalled();
    });

    it('returns the tracking code conflict reported by the port', async () => {
        const { loadReferences, registerByTenant, service } = createFixture();
        loadReferences.mockResolvedValue({
            shipmentType: { active: true },
            zone: null,
            sector: null,
        });
        registerByTenant.mockResolvedValue({
            ok: false,
            code: 'PACKAGE_TRACKING_CODE_CONFLICT',
        });

        await expect(service.execute(TENANT_ID, input())).resolves.toEqual({
            ok: false,
            code: 'PACKAGE_TRACKING_CODE_CONFLICT',
        });
    });

    it('does not touch the port when the input is invalid', async () => {
        const { loadReferences, registerByTenant, generate, service } =
            createFixture();

        await expect(
            service.execute(TENANT_ID, input({ weightKg: 0 })),
        ).rejects.toBeInstanceOf(InvalidPackageRegistrationError);
        expect(loadReferences).not.toHaveBeenCalled();
        expect(registerByTenant).not.toHaveBeenCalled();
        expect(generate).not.toHaveBeenCalled();
    });
});
