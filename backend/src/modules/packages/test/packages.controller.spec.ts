import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from '@nestjs/common';
import { RegisterPackageService } from '../application/register-package.service';
import { InvalidPackageRegistrationError } from '../domain/invalid-package-registration.error';
import { PackagesController } from '../presentation/packages.controller';

const TENANT_ID = '10000000-0000-4000-8000-000000000001';

function createFixture() {
    const execute = jest.fn();
    const service = { execute } as unknown as RegisterPackageService;

    return { execute, controller: new PackagesController(service) };
}

const body = {
    trackingCode: 'PKG-0001',
    address: { text: 'Calle 72 # 45-10', municipalityCode: '08001' },
    shipmentTypeId: '50000000-0000-4000-8000-000000000001',
    weightKg: 2.5,
    lengthCm: 30,
    widthCm: 20,
    heightCm: 10,
};

describe('PackagesController', () => {
    it('returns the registered package', async () => {
        const { controller, execute } = createFixture();
        const registered = {
            id: 'p1',
            trackingCode: 'PKG-0001',
            state: 'REGISTERED',
        };
        execute.mockResolvedValue({
            ok: true,
            package: registered,
        });

        await expect(
            controller.registerPackageEndpoint(TENANT_ID, body),
        ).resolves.toEqual(registered);
        expect(execute).toHaveBeenCalledWith(TENANT_ID, body);
    });

    it('maps validation errors to 400 VALIDATION_ERROR with field details', async () => {
        const { controller, execute } = createFixture();
        execute.mockRejectedValue(
            new InvalidPackageRegistrationError('weightKg', 'NOT_POSITIVE'),
        );

        const error = await controller
            .registerPackageEndpoint(TENANT_ID, body)
            .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).getResponse()).toMatchObject({
            code: 'VALIDATION_ERROR',
            fields: { weightKg: expect.any(String) as unknown },
        });
    });

    it.each([
        'PACKAGE_SHIPMENT_TYPE_NOT_FOUND',
        'PACKAGE_ZONE_NOT_FOUND',
        'PACKAGE_SECTOR_NOT_FOUND',
    ] as const)('maps %s to 404', async (code) => {
        const { controller, execute } = createFixture();
        execute.mockResolvedValue({ ok: false, code });

        const error = await controller
            .registerPackageEndpoint(TENANT_ID, body)
            .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(NotFoundException);
        expect((error as NotFoundException).getResponse()).toMatchObject({
            code,
        });
    });

    it.each([
        'PACKAGE_TRACKING_CODE_CONFLICT',
        'PACKAGE_SHIPMENT_TYPE_INACTIVE',
        'PACKAGE_SECTOR_ZONE_MISMATCH',
    ] as const)('maps %s to 409', async (code) => {
        const { controller, execute } = createFixture();
        execute.mockResolvedValue({ ok: false, code });

        const error = await controller
            .registerPackageEndpoint(TENANT_ID, body)
            .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ConflictException);
        expect((error as ConflictException).getResponse()).toMatchObject({
            code,
        });
    });

    it('does not hide unexpected errors', async () => {
        const { controller, execute } = createFixture();
        const failure = new Error('database down');
        execute.mockRejectedValue(failure);

        await expect(
            controller.registerPackageEndpoint(TENANT_ID, body),
        ).rejects.toBe(failure);
    });

    it('passes an empty object when the body is missing', async () => {
        const { controller, execute } = createFixture();
        execute.mockRejectedValue(
            new InvalidPackageRegistrationError('trackingCode', 'REQUIRED'),
        );

        await expect(
            controller.registerPackageEndpoint(TENANT_ID, undefined as never),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(execute).toHaveBeenCalledWith(TENANT_ID, {});
    });
});
