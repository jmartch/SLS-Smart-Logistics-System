import { DeterministicGeocoder } from '../domain/deterministic-geocoder';
import {
    AddressComponents,
    GeocodingInput,
    GeocodingReference,
} from '../domain/geocoding.types';

describe('DeterministicGeocoder', () => {
    const datasetId = 'dataset-ready-1';
    const municipalityCode = '08001';

    const exactComponents: AddressComponents = {
        streetType: 'CALLE',
        streetIdentifier: '80',
        generatingRoad: '53',
        plateNumber: '67',
        neighborhood: null,
    };

    function referenceFixture(
        overrides: Partial<GeocodingReference> = {},
    ): GeocodingReference {
        return {
            referenceId: 'ref-a-exact',
            datasetId,
            municipalityCode,
            normalizedAddress: 'CALLE 80 # 53-67',
            components: exactComponents,
            precision: 'ENTRANCE',
            latitude: 11.0132,
            longitude: -74.8271,
            ...overrides,
        };
    }

    function inputFixture(
        references: readonly GeocodingReference[] = [referenceFixture()],
    ): GeocodingInput {
        return {
            originalText: 'Calle 80 # 53-67',
            municipalityCode,
            datasetId,
            references,
        };
    }

    const exactReference = referenceFixture();

    const ambiguousReference = referenceFixture({
        referenceId: 'ref-b-exact',
        latitude: 11.0133,
        longitude: -74.8272,
    });

    const differentReference = referenceFixture({
        referenceId: 'ref-c-different',
        normalizedAddress: 'CALLE 81 # 53-67',
        components: {
            ...exactComponents,
            streetIdentifier: '81',
        },
        latitude: 11.014,
        longitude: -74.826,
    });

    const neighborhoodDifferenceReference = referenceFixture({
        referenceId: 'ref-neighborhood-difference',
        components: {
            ...exactComponents,
            neighborhood: 'EL PRADO',
        },
    });

    const streetTypeDifferenceReference = referenceFixture({
        referenceId: 'ref-street-type-difference',
        normalizedAddress: 'CARRERA 80 # 53-67',
        components: {
            ...exactComponents,
            streetType: 'CARRERA',
        },
    });

    const wrongDatasetReference = referenceFixture({
        referenceId: 'ref-wrong-dataset',
        datasetId: 'another-dataset',
    });

    const wrongMunicipalityReference = referenceFixture({
        referenceId: 'ref-wrong-municipality',
        municipalityCode: '11001',
    });

    const geocoder = new DeterministicGeocoder();

    it('selects a single exact match', () => {
        const result = geocoder.decide(inputFixture([exactReference]));

        expect(result).toMatchObject({
            normalizedText: 'CALLE 80 # 53-67',
            components: exactComponents,
            algorithmVersion: 'geocode-v1',
            status: 'MATCHED',
            selectedReferenceId: exactReference.referenceId,
        });

        expect(result.candidates).toHaveLength(1);
        expect(result.candidates[0]).toMatchObject({
            referenceId: exactReference.referenceId,
            rank: 1,
            score: 1,
            precision: exactReference.precision,
            latitude: exactReference.latitude,
            longitude: exactReference.longitude,
        });
    });

    it('requires review when two exact candidates have no score margin', () => {
        const result = geocoder.decide(
            inputFixture([exactReference, ambiguousReference]),
        );

        expect(result.status).toBe('REVIEW_REQUIRED');
        expect(result.selectedReferenceId).toBeNull();
        expect(result.candidates).toHaveLength(2);

        expect(result.candidates.map((candidate) => candidate.score)).toEqual([
            1, 1,
        ]);
    });

    it('returns NOT_FOUND when there are no candidates', () => {
        const result = geocoder.decide(inputFixture([]));

        expect(result).toMatchObject({
            normalizedText: 'CALLE 80 # 53-67',
            components: exactComponents,
            algorithmVersion: 'geocode-v1',
            status: 'NOT_FOUND',
            candidates: [],
            selectedReferenceId: null,
        });
    });

    it('produces the same decision regardless of reference input order', () => {
        const firstResult = geocoder.decide(
            inputFixture([exactReference, differentReference]),
        );

        const reversedResult = geocoder.decide(
            inputFixture([differentReference, exactReference]),
        );

        expect(reversedResult).toEqual(firstResult);
    });

    it('orders candidates tied on score by referenceId ascending', () => {
        const result = geocoder.decide(
            inputFixture([ambiguousReference, exactReference]),
        );

        expect(result.candidates.map((candidate) => candidate.referenceId)).toEqual(
            [exactReference.referenceId, ambiguousReference.referenceId],
        );

        expect(result.candidates.map((candidate) => candidate.rank)).toEqual([
            1, 2,
        ]);
    });

    it('excludes references from another dataset or municipality', () => {
        const result = geocoder.decide(
            inputFixture([
                wrongDatasetReference,
                wrongMunicipalityReference,
                exactReference,
            ]),
        );

        expect(result.candidates.map((candidate) => candidate.referenceId)).toEqual(
            [exactReference.referenceId],
        );
    });

    it('records the weighted score breakdown', () => {
        const result = geocoder.decide(inputFixture([exactReference]));

        expect(result.candidates[0]).toMatchObject({
            score: 1,
            scoreBreakdown: {
                streetType: 0.1,
                streetIdentifier: 0.3,
                generatingRoad: 0.25,
                plateNumber: 0.3,
                neighborhood: 0.05,
            },
        });
    });

    it('requires review when the best score is below 0.95', () => {
        const result = geocoder.decide(inputFixture([differentReference]));

        expect(result.candidates[0].score).toBe(0.7);
        expect(result.status).toBe('REVIEW_REQUIRED');
        expect(result.selectedReferenceId).toBeNull();
    });

    it('accepts a score exactly at the 0.95 threshold', () => {
        const result = geocoder.decide(
            inputFixture([neighborhoodDifferenceReference]),
        );

        expect(result.candidates[0].score).toBe(0.95);
        expect(result.status).toBe('MATCHED');
        expect(result.selectedReferenceId).toBe(
            neighborhoodDifferenceReference.referenceId,
        );
    });

    it('requires review when the score margin is below 0.10', () => {
        const result = geocoder.decide(
            inputFixture([exactReference, neighborhoodDifferenceReference]),
        );

        expect(result.candidates.map((candidate) => candidate.score)).toEqual([
            1, 0.95,
        ]);

        expect(result.status).toBe('REVIEW_REQUIRED');
        expect(result.selectedReferenceId).toBeNull();
    });

    it('accepts a score margin exactly at 0.10', () => {
        const result = geocoder.decide(
            inputFixture([exactReference, streetTypeDifferenceReference]),
        );

        expect(result.candidates.map((candidate) => candidate.score)).toEqual([
            1, 0.9,
        ]);

        expect(result.status).toBe('MATCHED');
        expect(result.selectedReferenceId).toBe(exactReference.referenceId);
    });
});
