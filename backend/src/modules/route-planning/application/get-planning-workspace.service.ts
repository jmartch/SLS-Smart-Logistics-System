import { PackageGeocodingPolicy } from '../../packages/domain/package-geocoding.policy';
import type { RoadProfile } from '../../geocoding/domain/network-attachment.types';
import type {
  MunicipalityGeocodingTarget,
  PackageGeocodingConfigPort,
} from '../../packages/application/ports/package-geocoding-config.port';
import {
  PlanningWorkspaceQueryPort,
  type PlanningWorkspacePackage,
  type PlanningWorkspaceQuery,
  type PlanningWorkspaceSnapshot,
} from './ports/planning-workspace-query.port';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_PROFILES = new Set([
  'MOTOR_VEHICLE',
  'MOTORCYCLE',
  'BICYCLE',
  'FOOT',
]);

export class GetPlanningWorkspaceService {
  constructor(
    private readonly workspaceQuery: PlanningWorkspaceQueryPort,
    private readonly configPort?: PackageGeocodingConfigPort,
  ) {}

  async execute(
    query: PlanningWorkspaceQuery,
  ): Promise<PlanningWorkspaceSnapshot> {
    if (!query.tenantId || !UUID_PATTERN.test(query.tenantId.trim())) {
      throw new Error('TENANT_MISMATCH');
    }

    if (query.zoneId !== undefined) {
      if (!UUID_PATTERN.test(query.zoneId.trim())) {
        throw new Error('Invalid zoneId: must be a valid UUID');
      }
    }

    if (query.datasetId !== undefined) {
      if (!UUID_PATTERN.test(query.datasetId.trim())) {
        throw new Error('Invalid datasetId: must be a valid UUID');
      }
    }

    if (query.profile !== undefined) {
      if (!VALID_PROFILES.has(query.profile)) {
        throw new Error('Invalid profile: must be a supported RoadProfile');
      }
    }

    if (query.window !== undefined) {
      const start = new Date(query.window.startAt).getTime();
      const end = new Date(query.window.endAt).getTime();
      if (Number.isNaN(start) || Number.isNaN(end) || start >= end) {
        throw new Error(
          'Invalid operating window: startAt must be before endAt',
        );
      }
    }

    const snapshot = await this.workspaceQuery.getWorkspace({
      tenantId: query.tenantId.trim(),
      zoneId: query.zoneId?.trim(),
      window: query.window
        ? {
            startAt: new Date(query.window.startAt).toISOString(),
            endAt: new Date(query.window.endAt).toISOString(),
          }
        : undefined,
      datasetId: query.datasetId?.trim(),
      profile: query.profile,
    });

    const targetCache = new Map<string, MunicipalityGeocodingTarget | null>();

    const candidatePackages: PlanningWorkspacePackage[] = [];
    for (const pkg of snapshot.candidatePackages) {
      if (!pkg.rawGeocoding) {
        candidatePackages.push({
          id: pkg.id,
          trackingCode: pkg.trackingCode,
          state: pkg.state,
          priority: pkg.priority,
          zoneId: pkg.zoneId,
          zoneName: pkg.zoneName,
          sectorId: pkg.sectorId,
          sectorName: pkg.sectorName,
          address: pkg.address,
          municipalityCode: pkg.municipalityCode ?? null,
          weightKg: pkg.weightKg,
          volumeM3: pkg.volumeM3,
          hasReadyCoordinates: pkg.hasReadyCoordinates,
          isGeocodingReady: false,
          geocodingStatus: null,
          networkAttachmentStatus: null,
          unsuitabilityReason: 'MISSING_GEOCODING_ATTEMPT',
          lastPendingReasonCode: pkg.lastPendingReasonCode,
          lastStateChangedAt: pkg.lastStateChangedAt,
        });
        continue;
      }

      const municipalityCode = pkg.municipalityCode?.trim();
      let configuredTarget: MunicipalityGeocodingTarget | null = null;
      if (this.configPort && municipalityCode) {
        if (targetCache.has(municipalityCode)) {
          configuredTarget = targetCache.get(municipalityCode)!;
        } else {
          configuredTarget = await this.configPort.findTargetForMunicipality(
            query.tenantId.trim(),
            municipalityCode,
          );
          targetCache.set(municipalityCode, configuredTarget);
        }
      }

      let targetConfigForEvaluation: {
        datasetId: string;
        profile: RoadProfile;
        maxAcceptanceRadiusMeters: number;
      } | null = null;

      if (configuredTarget) {
        const requestedDataset = query.datasetId?.trim();
        const requestedProfile = query.profile;

        const datasetMatches =
          !requestedDataset || requestedDataset === configuredTarget.datasetId;
        const profileMatches =
          !requestedProfile || requestedProfile === configuredTarget.profile;

        if (datasetMatches && profileMatches) {
          targetConfigForEvaluation = {
            datasetId: configuredTarget.datasetId,
            profile: configuredTarget.profile,
            maxAcceptanceRadiusMeters:
              configuredTarget.maxAcceptanceRadiusMeters,
          };
        } else if (!datasetMatches) {
          targetConfigForEvaluation = {
            datasetId: requestedDataset ?? configuredTarget.datasetId,
            profile: requestedProfile ?? configuredTarget.profile,
            maxAcceptanceRadiusMeters:
              configuredTarget.maxAcceptanceRadiusMeters,
          };
        } else {
          targetConfigForEvaluation = {
            datasetId: configuredTarget.datasetId,
            profile: requestedProfile ?? configuredTarget.profile,
            maxAcceptanceRadiusMeters:
              configuredTarget.maxAcceptanceRadiusMeters,
          };
        }
      }

      const rawAttachments = pkg.rawGeocoding.networkAttachments.map((a) => ({
        id: a.id,
        datasetId: a.datasetId,
        profile: a.profile,
        status: a.status,
        accessDistanceMeters: a.accessDistanceMeters,
      }));

      const evaluation = PackageGeocodingPolicy.evaluateEligibility({
        attemptStatus: pkg.rawGeocoding.attemptStatus,
        attemptDatasetId: pkg.rawGeocoding.attemptDatasetId,
        isDatasetReady: pkg.rawGeocoding.isDatasetReady,
        targetConfig: targetConfigForEvaluation,
        selectedCandidate: pkg.rawGeocoding.selectedCandidateId
          ? {
              id: pkg.rawGeocoding.selectedCandidateId,
              networkAttachments: rawAttachments,
            }
          : null,
      });

      candidatePackages.push({
        id: pkg.id,
        trackingCode: pkg.trackingCode,
        state: pkg.state,
        priority: pkg.priority,
        zoneId: pkg.zoneId,
        zoneName: pkg.zoneName,
        sectorId: pkg.sectorId,
        sectorName: pkg.sectorName,
        address: pkg.address,
        municipalityCode: pkg.municipalityCode ?? null,
        weightKg: pkg.weightKg,
        volumeM3: pkg.volumeM3,
        hasReadyCoordinates: pkg.hasReadyCoordinates,
        isGeocodingReady: evaluation.isEligible,
        geocodingStatus: pkg.rawGeocoding.attemptStatus,
        networkAttachmentStatus: evaluation.targetAttachment?.status ?? null,
        unsuitabilityReason: evaluation.unsuitabilityReason,
        lastPendingReasonCode: pkg.lastPendingReasonCode,
        lastStateChangedAt: pkg.lastStateChangedAt,
      });
    }

    return {
      ...snapshot,
      candidatePackages,
    };
  }
}
