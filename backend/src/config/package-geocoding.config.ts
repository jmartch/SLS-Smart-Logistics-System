import type { RoadProfile } from '../modules/geocoding/domain/network-attachment.types';
import type {
  MunicipalityGeocodingTarget,
  PackageGeocodingConfigPort,
} from '../modules/packages/application/ports/package-geocoding-config.port';

const VALID_ROAD_PROFILES = new Set<RoadProfile>([
  'MOTOR_VEHICLE',
  'MOTORCYCLE',
  'BICYCLE',
  'FOOT',
]);

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface MunicipalityConfigEntry {
  readonly datasetId: string;
  readonly profile: RoadProfile;
  readonly maxAcceptanceRadiusMeters: number;
  readonly maxReviewRadiusMeters?: number;
}

export class PackageGeocodingConfigAdapter implements PackageGeocodingConfigPort {
  private readonly municipalityTargets: Map<string, MunicipalityConfigEntry>;

  constructor(entries?: Record<string, MunicipalityConfigEntry>) {
    this.municipalityTargets = new Map();
    const configuredEntries = entries ?? this.loadFromEnvironment();
    if (configuredEntries) {
      for (const [code, entry] of Object.entries(configuredEntries)) {
        this.validateEntry(code, entry);
        this.municipalityTargets.set(code.trim(), entry);
      }
    }
  }

  private loadFromEnvironment():
    Record<string, MunicipalityConfigEntry> | undefined {
    const envConfig = process.env.PACKAGE_GEOCODING_MAPPING_JSON;
    if (!envConfig || envConfig.trim().length === 0) {
      return undefined;
    }
    try {
      const parsed: unknown = JSON.parse(envConfig);
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        throw new Error('PACKAGE_GEOCODING_MAPPING_JSON must be an object map');
      }
      return parsed as Record<string, MunicipalityConfigEntry>;
    } catch (error) {
      throw new Error(
        `Invalid PACKAGE_GEOCODING_MAPPING_JSON configuration: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private validateEntry(code: string, entry: MunicipalityConfigEntry): void {
    if (!code || code.trim().length === 0) {
      throw new Error('Municipality code cannot be empty');
    }
    if (!entry || typeof entry !== 'object') {
      throw new Error(
        `Configuration entry for municipality ${code} must be an object`,
      );
    }
    if (
      !entry.datasetId ||
      typeof entry.datasetId !== 'string' ||
      !UUID_REGEX.test(entry.datasetId.trim())
    ) {
      throw new Error(
        `datasetId must be a valid UUID string for municipality ${code}`,
      );
    }
    if (!entry.profile || !VALID_ROAD_PROFILES.has(entry.profile)) {
      throw new Error(
        `profile must be one of MOTOR_VEHICLE, MOTORCYCLE, BICYCLE, FOOT for municipality ${code}`,
      );
    }
    if (
      typeof entry.maxAcceptanceRadiusMeters !== 'number' ||
      !Number.isFinite(entry.maxAcceptanceRadiusMeters) ||
      entry.maxAcceptanceRadiusMeters <= 0
    ) {
      throw new Error(
        `maxAcceptanceRadiusMeters must be a positive finite number for municipality ${code}`,
      );
    }
    if (entry.maxReviewRadiusMeters !== undefined) {
      if (
        typeof entry.maxReviewRadiusMeters !== 'number' ||
        !Number.isFinite(entry.maxReviewRadiusMeters) ||
        entry.maxReviewRadiusMeters < entry.maxAcceptanceRadiusMeters
      ) {
        throw new Error(
          `maxReviewRadiusMeters must be >= maxAcceptanceRadiusMeters for municipality ${code}`,
        );
      }
    }
  }

  findTargetForMunicipality(
    _tenantId: string,
    municipalityCode: string,
  ): Promise<MunicipalityGeocodingTarget | null> {
    const entry = this.municipalityTargets.get(municipalityCode.trim());
    if (!entry) {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      datasetId: entry.datasetId,
      profile: entry.profile,
      maxAcceptanceRadiusMeters: entry.maxAcceptanceRadiusMeters,
      maxReviewRadiusMeters: entry.maxReviewRadiusMeters,
    });
  }
}
