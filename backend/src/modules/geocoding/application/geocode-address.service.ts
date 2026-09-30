import { AddressNormalizer } from '../domain/address-normalizer';
import { DeterministicGeocoder } from '../domain/deterministic-geocoder';
import type { GeocodingDecision } from '../domain/geocoding.types';
import { InvalidAddressError } from '../domain/invalid-address.error';
import type { GeocodingAddressPort } from './ports/geocoding-address.port';
import type { GeocodingAttemptPort } from './ports/geocoding-attempt.port';
import type { GeocodingCatalogPort } from './ports/geocoding-catalog.port';

const CANDIDATE_LIMIT = 20;

export interface GeocodeAddressCommand {
    readonly tenantId: string;
    readonly addressId: string;
    readonly datasetId: string;
}

export type GeocodeAddressResult =
    | { readonly kind: 'ADDRESS_NOT_FOUND' }
    | { readonly kind: 'DATASET_NOT_READY' }
    | {
        readonly kind: 'COMPLETED';
        readonly attemptId: string;
        readonly decision: GeocodingDecision;
    };

export class GeocodeAddressService {
    private readonly normalizer = new AddressNormalizer();
    private readonly geocoder = new DeterministicGeocoder(this.normalizer);

    constructor(
        private readonly addresses: GeocodingAddressPort,
        private readonly catalog: GeocodingCatalogPort,
        private readonly attempts: GeocodingAttemptPort,
    ) { }

    async execute(
        command: GeocodeAddressCommand,
    ): Promise<GeocodeAddressResult> {
        const address = await this.addresses.findByTenant({
            tenantId: command.tenantId,
            addressId: command.addressId,
        });

        if (address === null) {
            return {
                kind: 'ADDRESS_NOT_FOUND',
            };
        }

        const normalized = this.normalizer.normalize(address.originalText);
        const { streetType, streetIdentifier } = normalized.components;

        if (streetType === null || streetIdentifier === null) {
            throw new InvalidAddressError(
                'UNSUPPORTED_ADDRESS_FORMAT',
                'Address does not contain the components required for geocoding',
            );
        }

        const catalog = await this.catalog.findCandidates({
            datasetId: command.datasetId,
            municipalityCode: address.municipalityCode,
            searchKeyPrefix: `${streetType}|${streetIdentifier}`,
            limit: CANDIDATE_LIMIT,
        });

        if (catalog === null) {
            return { kind: 'DATASET_NOT_READY' };
        }

        const decision = this.geocoder.decide({
            originalText: address.originalText,
            municipalityCode: address.municipalityCode,
            datasetId: catalog.datasetId,
            references: catalog.references,
        });

        const saved = await this.attempts.saveAtomically({
            tenantId: command.tenantId,
            addressId: address.id,
            datasetId: catalog.datasetId,
            decision,
        });

        return {
            kind: 'COMPLETED',
            attemptId: saved.attemptId,
            decision,
        };
    }
}