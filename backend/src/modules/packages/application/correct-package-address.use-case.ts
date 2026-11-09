import { PackageNotFoundError } from '../domain/package-errors';
import { PackageGeocodingPolicy } from '../domain/package-geocoding.policy';
import type {
    CorrectAddressInput,
    PackageGeocodingDiagnostic,
} from '../domain/package-geocoding.types';
import type { PackageGeocodingUnitOfWorkPort } from './ports/package-geocoding.uow.port';
import type { ResolvePackageGeocodingUseCase } from './resolve-package-geocoding.use-case';

export interface CorrectPackageAddressResult {
    readonly packageId: string;
    readonly previousAddressId: string;
    readonly newAddressId: string;
    readonly geocoding: PackageGeocodingDiagnostic;
}

export class CorrectPackageAddressUseCase {
    constructor(
        private readonly uow: PackageGeocodingUnitOfWorkPort,
        private readonly resolveGeocoding: ResolvePackageGeocodingUseCase,
    ) {}

    async execute(
        input: CorrectAddressInput,
    ): Promise<CorrectPackageAddressResult> {
        PackageGeocodingPolicy.validateAddressCorrectionInput(input);

        return this.uow.runInTransaction(input.tenantId, async (session) => {
            const pkg = await session.packageRepository.findPackageForUpdate(
                input.tenantId,
                input.packageId,
            );

            if (!pkg) {
                throw new PackageNotFoundError(input.packageId);
            }

            PackageGeocodingPolicy.validateOperationAllowedState(
                pkg.id,
                pkg.state,
                'correct address',
            );

            const hasActiveAssignment =
                await session.packageRepository.hasActiveAssignment(
                    input.tenantId,
                    pkg.id,
                );
            PackageGeocodingPolicy.validateNoActiveAssignment(
                pkg.id,
                hasActiveAssignment,
            );

            PackageGeocodingPolicy.validateAddressReference(
                pkg.id,
                pkg.addressId,
                input.expectedAddressId,
            );

            PackageGeocodingPolicy.validateAttemptReference(
                pkg.id,
                pkg.geocodingAttemptId,
                input.expectedAttemptId,
            );

            const newAddress =
                await session.packageRepository.createAddressVersion({
                    tenantId: input.tenantId,
                    originalText: input.newOriginalText,
                    municipalityCode: input.newMunicipalityCode,
                });

            await session.packageRepository.updatePackageAddress({
                tenantId: input.tenantId,
                packageId: pkg.id,
                addressId: newAddress.id,
                geocodingAttemptId: null,
            });

            await session.auditPort.recordAddressCorrection({
                tenantId: input.tenantId,
                packageId: pkg.id,
                previousAddressId: pkg.addressId,
                newAddressId: newAddress.id,
                reason: input.reason,
                actorUserId: input.actorUserId,
                correlationId: input.correlationId,
            });

            const geocoding = await this.resolveGeocoding.executeInSession(
                session,
                {
                    tenantId: input.tenantId,
                    packageId: pkg.id,
                    addressId: newAddress.id,
                    actorUserId: input.actorUserId,
                    correlationId: input.correlationId,
                },
            );

            return {
                packageId: pkg.id,
                previousAddressId: pkg.addressId,
                newAddressId: newAddress.id,
                geocoding,
            };
        });
    }
}
