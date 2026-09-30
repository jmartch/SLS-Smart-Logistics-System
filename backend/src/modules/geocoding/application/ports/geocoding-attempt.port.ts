import type { GeocodingDecision } from '../../domain/geocoding.types';

export interface SaveGeocodingAttemptCommand {
    readonly tenantId: string;
    readonly addressId: string;
    readonly datasetId: string;
    readonly decision: GeocodingDecision;
}

export interface SavedGeocodingAttempt {
    readonly attemptId: string;
}

export interface GeocodingAttemptPort {
    saveAtomically(
        command: SaveGeocodingAttemptCommand,
    ): Promise<SavedGeocodingAttempt>;
}