import type { RoadProfile } from '../../../geocoding/domain/network-attachment.types';

export interface MunicipalityGeocodingTarget {
    readonly datasetId: string;
    readonly profile: RoadProfile;
    readonly maxAcceptanceRadiusMeters: number;
    readonly maxReviewRadiusMeters?: number;
}

export interface PackageGeocodingConfigPort {
    findTargetForMunicipality(
        tenantId: string,
        municipalityCode: string,
    ): Promise<MunicipalityGeocodingTarget | null>;
}
