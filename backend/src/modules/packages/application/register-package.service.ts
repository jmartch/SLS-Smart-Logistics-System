import { parsePackageRegistration } from '../domain/package-registration';
import {
    evaluatePackageReferences,
    type PackageReferenceFailure,
} from '../domain/package-reference.policy';
import type {
    PackageRegistrationPort,
    RegisterPackageOutcome,
} from './ports/package-registration.port';
import type { PublicTrackingTokenGenerator } from './ports/public-tracking-token.port';

export type RegisterPackageResult =
    | RegisterPackageOutcome
    | { readonly ok: false; readonly code: PackageReferenceFailure };

export class RegisterPackageService {
    constructor(
        private readonly registration: PackageRegistrationPort,
        private readonly tokens: PublicTrackingTokenGenerator,
    ) {}

    async execute(
        tenantId: string,
        input: unknown,
    ): Promise<RegisterPackageResult> {
        const data = parsePackageRegistration(input);

        const references = await this.registration.loadReferences(tenantId, {
            shipmentTypeId: data.shipmentTypeId,
            zoneId: data.zoneId,
            sectorId: data.sectorId,
        });

        const failure = evaluatePackageReferences(
            { zoneId: data.zoneId, sectorId: data.sectorId },
            references,
        );

        if (failure) {
            return { ok: false, code: failure };
        }

        return this.registration.registerByTenant(
            tenantId,
            data,
            this.tokens.generate(),
        );
    }
}
