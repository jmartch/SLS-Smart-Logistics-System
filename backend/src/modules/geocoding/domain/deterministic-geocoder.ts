import { AddressNormalizer } from './address-normalizer';
import {
    AddressComponents,
    GeocodingDecision,
    GeocodingInput,
    GeocodingReference,
    GeocodingScoreBreakdown,
    RankedGeocodingCandidate,
} from './geocoding.types';

const ALGORITHM_VERSION = 'geocode-v1';
const MINIMUM_AUTOMATIC_SCORE = 0.95;
const MINIMUM_AUTOMATIC_MARGIN = 0.1;

const SCORE_WEIGHTS: Readonly<GeocodingScoreBreakdown> = {
    streetType: 0.1,
    streetIdentifier: 0.3,
    generatingRoad: 0.25,
    plateNumber: 0.3,
    neighborhood: 0.05,
};

type UnrankedCandidate = Omit<RankedGeocodingCandidate, 'rank'>;

export class DeterministicGeocoder {
    constructor(private readonly normalizer = new AddressNormalizer()) { }

    decide(input: GeocodingInput): GeocodingDecision {
        const normalizedAddress = this.normalizer.normalize(input.originalText);

        const candidates = input.references
            .filter(
                (reference) =>
                    reference.datasetId === input.datasetId &&
                    reference.municipalityCode === input.municipalityCode,
            )
            .map((reference) =>
                this.scoreReference(normalizedAddress.components, reference),
            )
            .sort((left, right) => {
                const scoreDifference = right.score - left.score;

                if (scoreDifference !== 0) {
                    return scoreDifference;
                }

                if (left.referenceId < right.referenceId) {
                    return -1;
                }

                if (left.referenceId > right.referenceId) {
                    return 1;
                }

                return 0;
            })
            .map((candidate, index): RankedGeocodingCandidate => ({
                ...candidate,
                rank: index + 1,
            }));

        const [bestCandidate, secondCandidate] = candidates;

        if (!bestCandidate) {
            return {
                normalizedText: normalizedAddress.normalizedText,
                components: normalizedAddress.components,
                algorithmVersion: ALGORITHM_VERSION,
                status: 'NOT_FOUND',
                candidates: [],
                selectedReferenceId: null,
            };
        }

        const margin = secondCandidate
            ? this.roundToFourDecimals(bestCandidate.score - secondCandidate.score)
            : 1;

        const canSelectAutomatically =
            bestCandidate.score >= MINIMUM_AUTOMATIC_SCORE &&
            margin >= MINIMUM_AUTOMATIC_MARGIN;

        return {
            normalizedText: normalizedAddress.normalizedText,
            components: normalizedAddress.components,
            algorithmVersion: ALGORITHM_VERSION,
            status: canSelectAutomatically ? 'MATCHED' : 'REVIEW_REQUIRED',
            candidates,
            selectedReferenceId: canSelectAutomatically
                ? bestCandidate.referenceId
                : null,
        };
    }

    private scoreReference(
        input: AddressComponents,
        reference: GeocodingReference,
    ): UnrankedCandidate {
        const scoreBreakdown: GeocodingScoreBreakdown = {
            streetType: this.contribution(
                input.streetType,
                reference.components.streetType,
                SCORE_WEIGHTS.streetType,
            ),
            streetIdentifier: this.contribution(
                input.streetIdentifier,
                reference.components.streetIdentifier,
                SCORE_WEIGHTS.streetIdentifier,
            ),
            generatingRoad: this.contribution(
                input.generatingRoad,
                reference.components.generatingRoad,
                SCORE_WEIGHTS.generatingRoad,
            ),
            plateNumber: this.contribution(
                input.plateNumber,
                reference.components.plateNumber,
                SCORE_WEIGHTS.plateNumber,
            ),
            neighborhood: this.contribution(
                input.neighborhood,
                reference.components.neighborhood,
                SCORE_WEIGHTS.neighborhood,
            ),
        };

        const score = this.roundToFourDecimals(
            Object.values(scoreBreakdown).reduce(
                (total, contribution) => total + contribution,
                0,
            ),
        );

        return {
            referenceId: reference.referenceId,
            score,
            scoreBreakdown,
            precision: reference.precision,
            latitude: reference.latitude,
            longitude: reference.longitude,
        };
    }

    private contribution(
        inputValue: string | null,
        referenceValue: string | null,
        weight: number,
    ): number {
        return inputValue === referenceValue ? weight : 0;
    }

    private roundToFourDecimals(value: number): number {
        return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
    }
}
