import type { PackageRegistrationPort } from './package-registration.port';
import type { GeocodingAddressPort } from '../../../geocoding/application/ports/geocoding-address.port';
import type { GeocodingCatalogPort } from '../../../geocoding/application/ports/geocoding-catalog.port';
import type { GeocodingAttemptPort } from '../../../geocoding/application/ports/geocoding-attempt.port';
import type { NetworkAttachmentPort } from '../../../geocoding/application/ports/network-attachment.port';
import type { PackageGeocodingRepositoryPort } from './package-geocoding-repository.port';
import type { PackageGeocodingAuditPort } from './package-geocoding-audit.port';

export interface PackageGeocodingSession {
    readonly registrationPort: PackageRegistrationPort;
    readonly geocodingAddressPort: GeocodingAddressPort;
    readonly geocodingCatalogPort: GeocodingCatalogPort;
    readonly geocodingAttemptPort: GeocodingAttemptPort;
    readonly networkAttachmentPort: NetworkAttachmentPort;
    readonly packageRepository: PackageGeocodingRepositoryPort;
    readonly auditPort: PackageGeocodingAuditPort;
}

export interface PackageGeocodingUnitOfWorkPort {
    runInTransaction<T>(
        tenantId: string,
        operation: (session: PackageGeocodingSession) => Promise<T>,
    ): Promise<T>;
}
