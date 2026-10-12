import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AuthGuard } from '../../auth/presentation/auth.guard';
import { PermissionsGuard } from '../../auth/presentation/permissions.guard';
import { REQUIRED_PERMISSION_KEY } from '../../auth/presentation/require-permission.decorator';
import type { RequestContext } from '../../../shared/presentation/request-context.decorator';
import { RegisterPackageService } from '../application/register-package.service';
import { ListPackagesUseCase } from '../application/list-packages.use-case';
import { InvalidPackageRegistrationError } from '../domain/invalid-package-registration.error';
import {
    PackagesController,
    REGISTER_PACKAGES_PERMISSION,
} from '../presentation/packages.controller';

const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const USER_ID = '20000000-0000-4000-8000-000000000001';
const CORRELATION_ID = '30000000-0000-4000-8000-000000000001';

const context: RequestContext = {
    tenantId: TENANT_ID,
    actorUserId: USER_ID,
    correlationId: CORRELATION_ID,
};

function createFixture() {
    const execute = jest.fn();
    const list = jest.fn();
    const service = { execute } as unknown as RegisterPackageService;
    const listService = { execute: list } as unknown as ListPackagesUseCase;

    return {
        execute,
        list,
        controller: new PackagesController(service, listService),
    };
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
    it('protects package endpoints with AuthGuard and PermissionsGuard', () => {
        const guards = Reflect.getMetadata(
            GUARDS_METADATA,
            PackagesController,
        ) as unknown[];
        const permission = Reflect.getMetadata(
            REQUIRED_PERMISSION_KEY,
            PackagesController.prototype.registerPackageEndpoint,
        ) as unknown;

        expect(guards).toEqual([AuthGuard, PermissionsGuard]);
        expect(permission).toBe(REGISTER_PACKAGES_PERMISSION);
        expect(
            Reflect.getMetadata(
                REQUIRED_PERMISSION_KEY,
                PackagesController.prototype.listPackagesEndpoint,
            ),
        ).toBe(REGISTER_PACKAGES_PERMISSION);
    });

    it('lists only packages from the authenticated tenant context', async () => {
        const { controller, list } = createFixture();
        const packages = [{ id: 'p1', trackingCode: 'PKG-0001' }];
        list.mockResolvedValue(packages);

        await expect(controller.listPackagesEndpoint(context)).resolves.toEqual(
            packages,
        );
        expect(list).toHaveBeenCalledWith(TENANT_ID);
    });

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
            controller.registerPackageEndpoint(context, body),
        ).resolves.toEqual(registered);
        expect(execute).toHaveBeenCalledWith(
            {
                tenantId: TENANT_ID,
                actorUserId: USER_ID,
                correlationId: CORRELATION_ID,
            },
            body,
        );
    });

    it('maps validation errors to 400 VALIDATION_ERROR with field details', async () => {
        const { controller, execute } = createFixture();
        execute.mockRejectedValue(
            new InvalidPackageRegistrationError('weightKg', 'NOT_POSITIVE'),
        );

        const error = await controller
            .registerPackageEndpoint(context, body)
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
            .registerPackageEndpoint(context, body)
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
            .registerPackageEndpoint(context, body)
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
            controller.registerPackageEndpoint(context, body),
        ).rejects.toBe(failure);
    });

    it('passes an empty object when the body is missing', async () => {
        const { controller, execute } = createFixture();
        execute.mockRejectedValue(
            new InvalidPackageRegistrationError('trackingCode', 'REQUIRED'),
        );

        await expect(
            controller.registerPackageEndpoint(context, undefined as never),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(execute).toHaveBeenCalledWith(
            {
                tenantId: TENANT_ID,
                actorUserId: USER_ID,
                correlationId: CORRELATION_ID,
            },
            {},
        );
    });
});
