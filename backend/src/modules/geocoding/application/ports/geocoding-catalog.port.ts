import type { GeocodingReference } from '../../domain/geocoding.types';

export interface FindGeocodingCandidatesQuery {
    readonly datasetId: string;
    readonly municipalityCode: string;
    readonly searchKeyPrefix: string;
    readonly limit: number;
}

export interface ReadyGeocodingCatalog {
    readonly datasetId: string;
    readonly references: readonly GeocodingReference[];
}

export interface GeocodingCatalogPort {
    findCandidates(
        query: FindGeocodingCandidatesQuery,
    ): Promise<ReadyGeocodingCatalog | null>;
}
