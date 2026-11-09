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
import { ClassifyPackageService } from '../application/classify-package.service';
import { RegisterAndGeocodePackageUseCase } from '../application/register-and-geocode-package.use-case';
import { ResolvePackageGeocodingUseCase } from '../application/resolve-package-geocoding.use-case';
import { ReviewPackageGeocodingUseCase } from '../application/review-package-geocoding.use-case';
import { CorrectPackageAddressUseCase } from '../application/correct-package-address.use-case';
import { ListPackagesUseCase } from '../application/list-packages.use-case';
import { GetPackageDetailUseCase } from '../application/get-package-detail.use-case';
import { InvalidPackageRegistrationError } from '../domain/invalid-package-registration.error';
import { InvalidPackageTransitionError } from '../domain/invalid-package-transition.error';
import {
    PackageActiveAssignmentConflictError,
    PackageGeocodingCandidateNotFoundError,
    PackageGeocodingValidationError,
    PackageNotFoundError,
} from '../domain/package-errors';
import {
    CLASSIFY_PACKAGES_PERMISSIONS,
    COORDINATE_PACKAGE_PERMISSIONS,
    PackagesController,
    REGISTER_PACKAGES_PERMISSION,
    VIEW_PACKAGES_PERMISSIONS,
} from '../presentation/packages.controller';

const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const USER_ID = '20000000-0000-4000-8000-000000000001';
const CORRELATION_ID = '30000000-0000-4000-8000-000000000001';
const PACKAGE_ID = '40000000-0000-4000-8000-000000000001';
const ZONE_ID = '60000000-0000-4000-8000-000000000001';

const context: RequestContext = {
    tenantId: TENANT_ID,
    actorUserId: USER_ID,
    correlationId: CORRELATION_ID,
};

function createFixture() {
    const execute = jest.fn();
    const list = jest.fn();
    const getDetail = jest.fn();
    const classify = jest.fn();
    const resolve = jest.fn();
    const review = jest.fn();
    const correctAddress = jest.fn();

    const registerUseCase = {
        execute,
    } as unknown as RegisterAndGeocodePackageUseCase;
    const listService = { execute: list } as unknown as ListPackagesUseCase;
    const detailService = {
        execute: getDetail,
    } as unknown as GetPackageDetailUseCase;
    const classifyService = {
        execute: classify,
    } as unknown as ClassifyPackageService;
    const resolveUseCase = {
        execute: resolve,
    } as unknown as ResolvePackageGeocodingUseCase;
    const reviewUseCase = {
        execute: review,
    } as unknown as ReviewPackageGeocodingUseCase;
    const correctAddressUseCase = {
        execute: correctAddress,
    } as unknown as CorrectPackageAddressUseCase;

    return {
        execute,
        list,
        getDetail,
        classify,
        resolve,
        review,
        correctAddress,
        controller: new PackagesController(
            registerUseCase,
            listService,
            detailService,
            classifyService,
            resolveUseCase,
            reviewUseCase,
            correctAddressUseCase,
        ),
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
        const proto = PackagesController.prototype as Record<string, unknown>;
        const registerEndpoint = proto.registerPackageEndpoint;
        const listEndpoint = proto.listPackagesEndpoint;
        const detailEndpoint = proto.getPackageDetailEndpoint;
        const classifyEndpoint = proto.classifyPackageEndpoint;
        const resolveEndpoint = proto.resolveGeocodingEndpoint;
        const reviewEndpoint = proto.reviewGeocodingEndpoint;
        const correctEndpoint = proto.correctAddressEndpoint;

        expect(guards).toEqual([AuthGuard, PermissionsGuard]);
        expect(
            Reflect.getMetadata(
                REQUIRED_PERMISSION_KEY,
                registerEndpoint as object,
            ),
        ).toBe(REGISTER_PACKAGES_PERMISSION);
        expect(
            Reflect.getMetadata(
                REQUIRED_PERMISSION_KEY,
                listEndpoint as object,
            ),
        ).toEqual([...VIEW_PACKAGES_PERMISSIONS]);
        expect(
            Reflect.getMetadata(
                REQUIRED_PERMISSION_KEY,
                detailEndpoint as object,
            ),
        ).toEqual([...VIEW_PACKAGES_PERMISSIONS]);
        expect(
            Reflect.getMetadata(
                REQUIRED_PERMISSION_KEY,
                classifyEndpoint as object,
            ),
        ).toEqual([...CLASSIFY_PACKAGES_PERMISSIONS]);
        expect(
            Reflect.getMetadata(
                REQUIRED_PERMISSION_KEY,
                resolveEndpoint as object,
            ),
        ).toEqual([...COORDINATE_PACKAGE_PERMISSIONS]);
        expect(
            Reflect.getMetadata(
                REQUIRED_PERMISSION_KEY,
                reviewEndpoint as object,
            ),
        ).toEqual([...COORDINATE_PACKAGE_PERMISSIONS]);
        expect(
            Reflect.getMetadata(
                REQUIRED_PERMISSION_KEY,
                correctEndpoint as object,
            ),
        ).toEqual([...COORDINATE_PACKAGE_PERMISSIONS]);
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

    it('passes optional valid state filter to listPackages', async () => {
        const { controller, list } = createFixture();
        const packages = [{ id: 'p1', trackingCode: 'PKG-0001' }];
        list.mockResolvedValue(packages);

        await expect(
            controller.listPackagesEndpoint(context, 'REGISTERED'),
        ).resolves.toEqual(packages);
        expect(list).toHaveBeenCalledWith(TENANT_ID, { state: 'REGISTERED' });
    });

    it('gets package detail using the authenticated tenant context', async () => {
        const { controller, getDetail } = createFixture();
        const detail = { id: 'p1', trackingCode: 'PKG-0001' };
        getDetail.mockResolvedValue(detail);

        await expect(
            controller.getPackageDetailEndpoint(context, 'p1'),
        ).resolves.toEqual(detail);
        expect(getDetail).toHaveBeenCalledWith(TENANT_ID, 'p1');
    });

    it('returns the registered package with geocoding diagnostic', async () => {
        const { controller, execute } = createFixture();
        const registered = {
            id: 'p1',
            trackingCode: 'PKG-0001',
            state: 'REGISTERED',
        };
        const geocoding = {
            status: 'MATCHED',
            eligibility: 'ELIGIBLE',
            attemptId: 'a1',
            selectedCandidateId: 'c1',
            attachmentId: 'att1',
            attachmentStatus: 'AUTO_ACCEPTED',
        };
        execute.mockResolvedValue({
            ok: true,
            package: registered,
            geocoding,
        });

        await expect(
            controller.registerPackageEndpoint(context, body),
        ).resolves.toEqual({
            ...registered,
            geocoding,
        });
        expect(execute).toHaveBeenCalledWith(
            {
                tenantId: TENANT_ID,
                actorUserId: USER_ID,
                correlationId: CORRELATION_ID,
            },
            body,
        );
    });

    it('returns the classified package on POST :packageId/classify', async () => {
        const { controller, classify } = createFixture();
        const classified = {
            id: PACKAGE_ID,
            tenantId: TENANT_ID,
            trackingCode: 'PKG-0001',
            state: 'CLASSIFIED',
            zoneId: ZONE_ID,
            sectorId: null,
        };
        classify.mockResolvedValue({
            ok: true,
            package: classified,
        });

        await expect(
            controller.classifyPackageEndpoint(context, PACKAGE_ID, {
                zoneId: ZONE_ID,
            }),
        ).resolves.toEqual(classified);
        expect(classify).toHaveBeenCalledWith(
            {
                tenantId: TENANT_ID,
                actorUserId: USER_ID,
                correlationId: CORRELATION_ID,
            },
            PACKAGE_ID,
            { zoneId: ZONE_ID },
        );
    });

    it('maps InvalidPackageTransitionError on classify to 409 ConflictException', async () => {
        const { controller, classify } = createFixture();
        classify.mockRejectedValue(
            new InvalidPackageTransitionError(
                PACKAGE_ID,
                'REGISTERED',
                'DELIVERED',
            ),
        );

        await expect(
            controller.classifyPackageEndpoint(context, PACKAGE_ID, {
                zoneId: ZONE_ID,
            }),
        ).rejects.toThrow(ConflictException);
    });

    it('maps PackageNotFoundError on classify to 404 NotFoundException', async () => {
        const { controller, classify } = createFixture();
        classify.mockRejectedValue(new PackageNotFoundError(PACKAGE_ID));

        await expect(
            controller.classifyPackageEndpoint(context, PACKAGE_ID, {
                zoneId: ZONE_ID,
            }),
        ).rejects.toThrow(NotFoundException);
    });

    it('maps validation errors to 400 VALIDATION_ERROR with field details', async () => {
        const { controller, execute } = createFixture();
        execute.mockRejectedValue(
            new InvalidPackageRegistrationError('trackingCode', 'REQUIRED'),
        );

        await expect(
            controller.registerPackageEndpoint(context, body),
        ).rejects.toThrow(BadRequestException);
    });

    it('maps PACKAGE_SHIPMENT_TYPE_NOT_FOUND to 404', async () => {
        const { controller, execute } = createFixture();
        execute.mockResolvedValue({
            ok: false,
            code: 'PACKAGE_SHIPMENT_TYPE_NOT_FOUND',
        });

        await expect(
            controller.registerPackageEndpoint(context, body),
        ).rejects.toThrow(NotFoundException);
    });

    it('maps PACKAGE_ZONE_NOT_FOUND to 404', async () => {
        const { controller, execute } = createFixture();
        execute.mockResolvedValue({
            ok: false,
            code: 'PACKAGE_ZONE_NOT_FOUND',
        });

        await expect(
            controller.registerPackageEndpoint(context, body),
        ).rejects.toThrow(NotFoundException);
    });

    it('maps PACKAGE_SECTOR_NOT_FOUND to 404', async () => {
        const { controller, execute } = createFixture();
        execute.mockResolvedValue({
            ok: false,
            code: 'PACKAGE_SECTOR_NOT_FOUND',
        });

        await expect(
            controller.registerPackageEndpoint(context, body),
        ).rejects.toThrow(NotFoundException);
    });

    it('maps PACKAGE_TRACKING_CODE_CONFLICT to 409', async () => {
        const { controller, execute } = createFixture();
        execute.mockResolvedValue({
            ok: false,
            code: 'PACKAGE_TRACKING_CODE_CONFLICT',
        });

        await expect(
            controller.registerPackageEndpoint(context, body),
        ).rejects.toThrow(ConflictException);
    });

    it('maps PACKAGE_SHIPMENT_TYPE_INACTIVE to 409', async () => {
        const { controller, execute } = createFixture();
        execute.mockResolvedValue({
            ok: false,
            code: 'PACKAGE_SHIPMENT_TYPE_INACTIVE',
        });

        await expect(
            controller.registerPackageEndpoint(context, body),
        ).rejects.toThrow(ConflictException);
    });

    it('maps PACKAGE_SECTOR_ZONE_MISMATCH to 409', async () => {
        const { controller, execute } = createFixture();
        execute.mockResolvedValue({
            ok: false,
            code: 'PACKAGE_SECTOR_ZONE_MISMATCH',
        });

        await expect(
            controller.registerPackageEndpoint(context, body),
        ).rejects.toThrow(ConflictException);
    });

    it('does not hide unexpected errors', async () => {
        const { controller, execute } = createFixture();
        execute.mockRejectedValue(new Error('database explosion'));

        await expect(
            controller.registerPackageEndpoint(context, body),
        ).rejects.toThrow('database explosion');
    });

    it('passes an empty object when the body is missing', async () => {
        const { controller, execute } = createFixture();
        execute.mockResolvedValue({
            ok: true,
            package: { id: 'p1' },
            geocoding: { status: 'MATCHED', eligibility: 'ELIGIBLE' },
        });

        await expect(
            controller.registerPackageEndpoint(
                context,
                undefined as unknown as typeof body,
            ),
        ).resolves.toEqual({
            id: 'p1',
            geocoding: { status: 'MATCHED', eligibility: 'ELIGIBLE' },
        });
        expect(execute).toHaveBeenCalledWith(
            {
                tenantId: TENANT_ID,
                actorUserId: USER_ID,
                correlationId: CORRELATION_ID,
            },
            {},
        );
    });

    it('executes resolveGeocodingEndpoint on POST :packageId/geocoding/resolve', async () => {
        const { controller, resolve } = createFixture();
        const diagnostic = {
            status: 'MATCHED',
            eligibility: 'ELIGIBLE',
        };
        resolve.mockResolvedValue(diagnostic);

        const payload = {
            expectedAttemptId: '50000000-0000-4000-8000-000000000001',
            forceRetry: true,
            operationId: 'op-1',
        };

        await expect(
            controller.resolveGeocodingEndpoint(context, PACKAGE_ID, payload),
        ).resolves.toEqual(diagnostic);
        expect(resolve).toHaveBeenCalledWith({
            tenantId: TENANT_ID,
            packageId: PACKAGE_ID,
            actorUserId: USER_ID,
            correlationId: CORRELATION_ID,
            expectedAttemptId: payload.expectedAttemptId,
            forceRetry: payload.forceRetry,
            operationId: payload.operationId,
        });
    });

    it('maps PackageGeocodingValidationError on resolveGeocodingEndpoint to 400 BadRequestException', async () => {
        const { controller, resolve } = createFixture();
        resolve.mockRejectedValue(
            new PackageGeocodingValidationError(
                'Invalid operation payload',
                'operationId',
            ),
        );

        await expect(
            controller.resolveGeocodingEndpoint(context, PACKAGE_ID, {}),
        ).rejects.toThrow(BadRequestException);
    });

    it('executes reviewGeocodingEndpoint on POST :packageId/geocoding/review', async () => {
        const { controller, review } = createFixture();
        const diagnostic = {
            status: 'MATCHED',
            eligibility: 'ELIGIBLE',
        };
        review.mockResolvedValue(diagnostic);

        const payload = {
            expectedAddressId: '60000000-0000-4000-8000-000000000001',
            expectedAttemptId: '50000000-0000-4000-8000-000000000001',
            candidateId: '70000000-0000-4000-8000-000000000001',
            decision: 'APPROVED' as const,
            reason: 'Manual validation',
            operationId: 'op-review-1',
        };

        await expect(
            controller.reviewGeocodingEndpoint(context, PACKAGE_ID, payload),
        ).resolves.toEqual(diagnostic);
        expect(review).toHaveBeenCalledWith({
            tenantId: TENANT_ID,
            packageId: PACKAGE_ID,
            expectedAddressId: payload.expectedAddressId,
            expectedAttemptId: payload.expectedAttemptId,
            candidateId: payload.candidateId,
            decision: payload.decision,
            reason: payload.reason,
            reviewerUserId: USER_ID,
            correlationId: CORRELATION_ID,
            operationId: payload.operationId,
        });
    });

    it('maps PackageGeocodingCandidateNotFoundError on reviewGeocodingEndpoint to 404 NotFoundException', async () => {
        const { controller, review } = createFixture();
        review.mockRejectedValue(
            new PackageGeocodingCandidateNotFoundError(
                '70000000-0000-4000-8000-000000000001',
            ),
        );

        const payload = {
            expectedAddressId: '60000000-0000-4000-8000-000000000001',
            expectedAttemptId: '50000000-0000-4000-8000-000000000001',
            candidateId: '70000000-0000-4000-8000-000000000001',
            decision: 'APPROVED' as const,
            reason: 'Manual validation',
        };

        await expect(
            controller.reviewGeocodingEndpoint(context, PACKAGE_ID, payload),
        ).rejects.toThrow(NotFoundException);
    });

    it('executes correctAddressEndpoint on POST :packageId/address-corrections', async () => {
        const { controller, correctAddress } = createFixture();
        const correctionResult = {
            packageId: PACKAGE_ID,
            previousAddressId: '60000000-0000-4000-8000-000000000001',
            newAddressId: '60000000-0000-4000-8000-000000000002',
            geocoding: {
                status: 'MATCHED',
                eligibility: 'ELIGIBLE',
            },
        };
        correctAddress.mockResolvedValue(correctionResult);

        const payload = {
            expectedAddressId: '60000000-0000-4000-8000-000000000001',
            newOriginalText: 'Calle 80 # 53-67',
            newMunicipalityCode: '08001',
            reason: 'Corrected number',
            expectedAttemptId: '50000000-0000-4000-8000-000000000001',
        };

        await expect(
            controller.correctAddressEndpoint(context, PACKAGE_ID, payload),
        ).resolves.toEqual(correctionResult);
        expect(correctAddress).toHaveBeenCalledWith({
            tenantId: TENANT_ID,
            packageId: PACKAGE_ID,
            expectedAddressId: payload.expectedAddressId,
            newOriginalText: payload.newOriginalText,
            newMunicipalityCode: payload.newMunicipalityCode,
            reason: payload.reason,
            actorUserId: USER_ID,
            correlationId: CORRELATION_ID,
            expectedAttemptId: payload.expectedAttemptId,
        });
    });

    it('maps PackageActiveAssignmentConflictError on correctAddressEndpoint to 409 ConflictException', async () => {
        const { controller, correctAddress } = createFixture();
        correctAddress.mockRejectedValue(
            new PackageActiveAssignmentConflictError(PACKAGE_ID),
        );

        const payload = {
            expectedAddressId: '60000000-0000-4000-8000-000000000001',
            newOriginalText: 'Calle 80 # 53-67',
            newMunicipalityCode: '08001',
            reason: 'Corrected number',
        };

        await expect(
            controller.correctAddressEndpoint(context, PACKAGE_ID, payload),
        ).rejects.toThrow(ConflictException);
    });
});
