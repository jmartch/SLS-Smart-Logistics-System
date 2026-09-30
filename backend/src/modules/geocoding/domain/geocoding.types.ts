export type GeocodingDecisionStatus =
    'MATCHED' | 'REVIEW_REQUIRED' | 'NOT_FOUND';

export type AddressPrecision =
    'ENTRANCE' | 'BUILDING' | 'INTERPOLATED' | 'STREET';

export interface GeocodingInput {
    originalText: string;
    municipalityCode: string;
    datasetId: string;
    references: readonly GeocodingReference[];
}

export interface AddressComponents {
    streetType: string | null;
    streetIdentifier: string | null;
    generatingRoad: string | null;
    plateNumber: string | null;
    neighborhood: string | null;
}

export interface GeocodingReference {
    referenceId: string;
    datasetId: string;
    municipalityCode: string;
    normalizedAddress: string;
    components: AddressComponents;
    precision: AddressPrecision;
    latitude: number;
    longitude: number;
}

export interface GeocodingScoreBreakdown {
    streetType: number;
    streetIdentifier: number;
    generatingRoad: number;
    plateNumber: number;
    neighborhood: number;
}

export interface RankedGeocodingCandidate {
    referenceId: string;
    rank: number;
    score: number;
    scoreBreakdown: GeocodingScoreBreakdown;
    precision: AddressPrecision;
    latitude: number;
    longitude: number;
}

export interface GeocodingDecision {
    normalizedText: string;
    components: AddressComponents;
    algorithmVersion: string;
    status: GeocodingDecisionStatus;
    candidates: readonly RankedGeocodingCandidate[];
    selectedReferenceId: string | null;
}

export interface NormalizedAddress {
    normalizedText: string;
    components: AddressComponents;
}
