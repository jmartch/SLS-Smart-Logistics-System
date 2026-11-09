import type { PackageReferenceFailure } from '../domain/package-reference.policy';
import type { PackageGeocodingDiagnostic } from '../domain/package-geocoding.types';
import type {
    PackageRegistrationContext,
    RegisteredPackage,
} from './ports/package-registration.port';
import type { PublicTrackingTokenGenerator } from './ports/public-tracking-token.port';
import type { PackageGeocodingUnitOfWorkPort } from './ports/package-geocoding.uow.port';
import { RegisterPackageService } from './register-package.service';
import type { ResolvePackageGeocodingUseCase } from './resolve-package-geocoding.use-case';

export type RegisterAndGeocodePackageResult =
    | {
          readonly ok: true;
          readonly package: RegisteredPackage;
          readonly geocoding: PackageGeocodingDiagnostic;
      }
    | {
          readonly ok: false;
          readonly code:
              PackageReferenceFailure | 'PACKAGE_TRACKING_CODE_CONFLICT';
      };

export class RegisterAndGeocodePackageUseCase {
    constructor(
        private readonly uow: PackageGeocodingUnitOfWorkPort,
        private readonly tokens: PublicTrackingTokenGenerator,
        private readonly resolveGeocoding: ResolvePackageGeocodingUseCase,
    ) {}

    async execute(
        context: PackageRegistrationContext,
        input: unknown,
    ): Promise<RegisterAndGeocodePackageResult> {
        return this.uow.runInTransaction(context.tenantId, async (session) => {
            const registrationService = new RegisterPackageService(
                session.registrationPort,
                this.tokens,
            );

            const registrationResult = await registrationService.execute(
                context,
                input,
            );

            if (!registrationResult.ok) {
                return registrationResult;
            }

            const registeredPackage = registrationResult.package;

            const geocoding = await this.resolveGeocoding.executeInSession(
                session,
                {
                    tenantId: context.tenantId,
                    packageId: registeredPackage.id,
                    addressId: registeredPackage.addressId,
                    actorUserId: context.actorUserId,
                    correlationId: context.correlationId,
                },
            );

            return {
                ok: true,
                package: registeredPackage,
                geocoding,
            };
        });
    }
}
