import { GetPlanningWorkspaceService } from '../application/get-planning-workspace.service';
import type { PackageGeocodingConfigPort } from '../../packages/application/ports/package-geocoding-config.port';
import {
  PlanningWorkspaceQueryPort,
  type PlanningWorkspaceQuery,
  type PlanningWorkspaceSnapshot,
} from '../application/ports/planning-workspace-query.port';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const ZONE_A = '20000000-0000-4000-8000-000000000001';
const DATASET_1 = '11000000-0000-4000-8000-000000000001';

function createEmptySnapshot(tenantId: string): PlanningWorkspaceSnapshot {
  return {
    tenantId,
    window: null,
    zones: [],
    depots: [],
    datasets: [],
    vehicles: [],
    couriers: [],
    candidatePackages: [],
    editableRoutes: [],
  };
}

describe('GetPlanningWorkspaceService', () => {
  it('queries tenant-scoped workspace resources and normalizes the operating window', async () => {
    const getWorkspace = jest
      .fn<Promise<PlanningWorkspaceSnapshot>, [PlanningWorkspaceQuery]>()
      .mockResolvedValue({
        ...createEmptySnapshot(TENANT_A),
        window: {
          startAt: '2026-10-12T08:00:00.000Z',
          endAt: '2026-10-12T13:00:00.000Z',
        },
        editableRoutes: [
          {
            id: '70000000-0000-4000-8000-000000000001',
            state: 'PLANNED',
            vehicleId: '50000000-0000-4000-8000-000000000001',
            vehiclePlate: 'BAQ-101',
            courierId: '60000000-0000-4000-8000-000000000001',
            courierEmail: 'courier@demo.co',
            depotId: '30000000-0000-4000-8000-000000000001',
            plannedStartAt: '2026-10-12T08:00:00.000Z',
            plannedEndAt: '2026-10-12T13:00:00.000Z',
            stopCount: 3,
            assignedPackageCount: 3,
            assignedWeightKg: '15.000',
            assignedVolumeM3: '0.090000',
            remainingWeightKg: '85.000',
            remainingVolumeM3: '0.910000',
          },
        ],
      });

    const port: PlanningWorkspaceQueryPort = { getWorkspace };
    const service = new GetPlanningWorkspaceService(port);

    const result = await service.execute({
      tenantId: TENANT_A,
      zoneId: ZONE_A,
      window: {
        startAt: '2026-10-12T08:00:00Z',
        endAt: '2026-10-12T13:00:00Z',
      },
    });

    expect(getWorkspace).toHaveBeenCalledWith({
      tenantId: TENANT_A,
      zoneId: ZONE_A,
      window: {
        startAt: '2026-10-12T08:00:00.000Z',
        endAt: '2026-10-12T13:00:00.000Z',
      },
    });
    expect(result.tenantId).toBe(TENANT_A);
    expect(result.editableRoutes).toHaveLength(1);
    expect(result.editableRoutes[0]?.state).toBe('PLANNED');
  });

  it('evaluates candidate packages geocoding eligibility using query target and config', async () => {
    const getWorkspace = jest
      .fn<Promise<PlanningWorkspaceSnapshot>, [PlanningWorkspaceQuery]>()
      .mockResolvedValue({
        ...createEmptySnapshot(TENANT_A),
        candidatePackages: [
          {
            id: 'pkg-1',
            trackingCode: 'PKG-0100',
            state: 'CLASSIFIED',
            priority: 'HIGH',
            zoneId: ZONE_A,
            zoneName: 'Zona Norte',
            sectorId: null,
            sectorName: null,
            address: 'Cra 53 # 82-10',
            municipalityCode: '08001',
            weightKg: '4.25',
            volumeM3: '0.015',
            hasReadyCoordinates: true,
            rawGeocoding: {
              attemptStatus: 'MATCHED',
              attemptDatasetId: DATASET_1,
              isDatasetReady: true,
              selectedCandidateId: 'cand-1',
              networkAttachments: [
                {
                  id: 'att-1',
                  datasetId: DATASET_1,
                  profile: 'MOTOR_VEHICLE',
                  status: 'AUTO_ACCEPTED',
                  accessDistanceMeters: 10,
                },
              ],
            },
            lastPendingReasonCode: null,
            lastStateChangedAt: null,
          },
        ],
      });

    const configPort: PackageGeocodingConfigPort = {
      findTargetForMunicipality: jest.fn().mockResolvedValue({
        datasetId: DATASET_1,
        profile: 'MOTOR_VEHICLE',
        maxAcceptanceRadiusMeters: 100,
      }),
    };

    const service = new GetPlanningWorkspaceService(
      { getWorkspace },
      configPort,
    );

    const result = await service.execute({
      tenantId: TENANT_A,
      datasetId: DATASET_1,
      profile: 'MOTOR_VEHICLE',
    });

    expect(result.candidatePackages[0]?.isGeocodingReady).toBe(true);
    expect(result.candidatePackages[0]?.geocodingStatus).toBe('MATCHED');
    expect(result.candidatePackages[0]?.networkAttachmentStatus).toBe(
      'AUTO_ACCEPTED',
    );
    expect(result.candidatePackages[0]?.unsuitabilityReason).toBeNull();
  });

  it('marks package ineligible when access distance exceeds municipality radius threshold', async () => {
    const getWorkspace = jest
      .fn<Promise<PlanningWorkspaceSnapshot>, [PlanningWorkspaceQuery]>()
      .mockResolvedValue({
        ...createEmptySnapshot(TENANT_A),
        candidatePackages: [
          {
            id: 'pkg-exceeded',
            trackingCode: 'PKG-0101',
            state: 'CLASSIFIED',
            priority: 'NORMAL',
            zoneId: ZONE_A,
            zoneName: 'Zona Norte',
            sectorId: null,
            sectorName: null,
            address: 'Cra 53 # 82-10',
            municipalityCode: '08001',
            weightKg: '4.25',
            volumeM3: '0.015',
            hasReadyCoordinates: true,
            rawGeocoding: {
              attemptStatus: 'MATCHED',
              attemptDatasetId: DATASET_1,
              isDatasetReady: true,
              selectedCandidateId: 'cand-1',
              networkAttachments: [
                {
                  id: 'att-1',
                  datasetId: DATASET_1,
                  profile: 'MOTOR_VEHICLE',
                  status: 'AUTO_ACCEPTED',
                  accessDistanceMeters: 150,
                },
              ],
            },
            lastPendingReasonCode: null,
            lastStateChangedAt: null,
          },
        ],
      });

    const configPort: PackageGeocodingConfigPort = {
      findTargetForMunicipality: jest.fn().mockResolvedValue({
        datasetId: DATASET_1,
        profile: 'MOTOR_VEHICLE',
        maxAcceptanceRadiusMeters: 100,
      }),
    };

    const service = new GetPlanningWorkspaceService(
      { getWorkspace },
      configPort,
    );
    const result = await service.execute({
      tenantId: TENANT_A,
      datasetId: DATASET_1,
      profile: 'MOTOR_VEHICLE',
    });

    expect(result.candidatePackages[0]?.isGeocodingReady).toBe(false);
    expect(result.candidatePackages[0]?.unsuitabilityReason).toBe(
      'NETWORK_ATTACHMENT_NOT_READY',
    );
  });

  it('marks package ineligible when municipal target configuration is missing', async () => {
    const getWorkspace = jest
      .fn<Promise<PlanningWorkspaceSnapshot>, [PlanningWorkspaceQuery]>()
      .mockResolvedValue({
        ...createEmptySnapshot(TENANT_A),
        candidatePackages: [
          {
            id: 'pkg-no-target',
            trackingCode: 'PKG-0102',
            state: 'CLASSIFIED',
            priority: 'NORMAL',
            zoneId: ZONE_A,
            zoneName: 'Zona Norte',
            sectorId: null,
            sectorName: null,
            address: 'Cra 53 # 82-10',
            municipalityCode: '99999',
            weightKg: '2.0',
            volumeM3: '0.010',
            hasReadyCoordinates: true,
            rawGeocoding: {
              attemptStatus: 'MATCHED',
              attemptDatasetId: DATASET_1,
              isDatasetReady: true,
              selectedCandidateId: 'cand-1',
              networkAttachments: [
                {
                  id: 'att-1',
                  datasetId: DATASET_1,
                  profile: 'MOTOR_VEHICLE',
                  status: 'AUTO_ACCEPTED',
                  accessDistanceMeters: 20,
                },
              ],
            },
            lastPendingReasonCode: null,
            lastStateChangedAt: null,
          },
        ],
      });

    const configPort: PackageGeocodingConfigPort = {
      findTargetForMunicipality: jest.fn().mockResolvedValue(null),
    };

    const service = new GetPlanningWorkspaceService(
      { getWorkspace },
      configPort,
    );
    const result = await service.execute({
      tenantId: TENANT_A,
      datasetId: DATASET_1,
      profile: 'MOTOR_VEHICLE',
    });

    expect(result.candidatePackages[0]?.isGeocodingReady).toBe(false);
    expect(result.candidatePackages[0]?.unsuitabilityReason).toBe(
      'DATASET_NOT_READY',
    );
  });

  it('marks package ineligible when requested profile is incompatible with target or candidate attachment', async () => {
    const getWorkspace = jest
      .fn<Promise<PlanningWorkspaceSnapshot>, [PlanningWorkspaceQuery]>()
      .mockResolvedValue({
        ...createEmptySnapshot(TENANT_A),
        candidatePackages: [
          {
            id: 'pkg-wrong-profile',
            trackingCode: 'PKG-0103',
            state: 'CLASSIFIED',
            priority: 'NORMAL',
            zoneId: ZONE_A,
            zoneName: 'Zona Norte',
            sectorId: null,
            sectorName: null,
            address: 'Cra 53 # 82-10',
            municipalityCode: '08001',
            weightKg: '2.0',
            volumeM3: '0.010',
            hasReadyCoordinates: true,
            rawGeocoding: {
              attemptStatus: 'MATCHED',
              attemptDatasetId: DATASET_1,
              isDatasetReady: true,
              selectedCandidateId: 'cand-1',
              networkAttachments: [
                {
                  id: 'att-1',
                  datasetId: DATASET_1,
                  profile: 'MOTOR_VEHICLE',
                  status: 'AUTO_ACCEPTED',
                  accessDistanceMeters: 20,
                },
              ],
            },
            lastPendingReasonCode: null,
            lastStateChangedAt: null,
          },
        ],
      });

    const configPort: PackageGeocodingConfigPort = {
      findTargetForMunicipality: jest.fn().mockResolvedValue({
        datasetId: DATASET_1,
        profile: 'MOTOR_VEHICLE',
        maxAcceptanceRadiusMeters: 100,
      }),
    };

    const service = new GetPlanningWorkspaceService(
      { getWorkspace },
      configPort,
    );
    const result = await service.execute({
      tenantId: TENANT_A,
      datasetId: DATASET_1,
      profile: 'BICYCLE',
    });

    expect(result.candidatePackages[0]?.isGeocodingReady).toBe(false);
    expect(result.candidatePackages[0]?.unsuitabilityReason).toBe(
      'NETWORK_ATTACHMENT_NOT_READY',
    );
  });

  it('marks package without rawGeocoding as ineligible and does not leak rawGeocoding in the API response', async () => {
    const getWorkspace = jest
      .fn<Promise<PlanningWorkspaceSnapshot>, [PlanningWorkspaceQuery]>()
      .mockResolvedValue({
        ...createEmptySnapshot(TENANT_A),
        candidatePackages: [
          {
            id: 'pkg-no-raw',
            trackingCode: 'PKG-0104',
            state: 'CLASSIFIED',
            priority: 'NORMAL',
            zoneId: ZONE_A,
            zoneName: 'Zona Norte',
            sectorId: null,
            sectorName: null,
            address: 'Cra 53 # 82-10',
            municipalityCode: '08001',
            weightKg: '2.0',
            volumeM3: '0.010',
            hasReadyCoordinates: false,
            rawGeocoding: null,
            lastPendingReasonCode: null,
            lastStateChangedAt: null,
          },
        ],
      });

    const service = new GetPlanningWorkspaceService({ getWorkspace });
    const result = await service.execute({
      tenantId: TENANT_A,
    });

    const candidate = result.candidatePackages[0];
    expect(candidate).toBeDefined();
    expect(candidate?.isGeocodingReady).toBe(false);
    expect(candidate?.geocodingStatus).toBeNull();
    expect(candidate?.networkAttachmentStatus).toBeNull();
    expect(candidate?.unsuitabilityReason).toBe('MISSING_GEOCODING_ATTEMPT');
    expect('rawGeocoding' in (candidate ?? {})).toBe(false);
  });

  it('rejects invalid tenantId with TENANT_MISMATCH', async () => {
    const port: PlanningWorkspaceQueryPort = {
      getWorkspace: jest.fn(),
    };
    const service = new GetPlanningWorkspaceService(port);

    await expect(service.execute({ tenantId: 'not-a-uuid' })).rejects.toThrow(
      'TENANT_MISMATCH',
    );
  });

  it('rejects invalid zoneId when not a UUID', async () => {
    const port: PlanningWorkspaceQueryPort = {
      getWorkspace: jest.fn(),
    };
    const service = new GetPlanningWorkspaceService(port);

    await expect(
      service.execute({ tenantId: TENANT_A, zoneId: 'invalid-zone' }),
    ).rejects.toThrow('Invalid zoneId');
  });

  it('rejects invalid datasetId when not a UUID', async () => {
    const port: PlanningWorkspaceQueryPort = {
      getWorkspace: jest.fn(),
    };
    const service = new GetPlanningWorkspaceService(port);

    await expect(
      service.execute({ tenantId: TENANT_A, datasetId: 'invalid-dataset' }),
    ).rejects.toThrow('Invalid datasetId');
  });

  it('rejects invalid profile when not a valid RoadProfile', async () => {
    const port: PlanningWorkspaceQueryPort = {
      getWorkspace: jest.fn(),
    };
    const service = new GetPlanningWorkspaceService(port);

    await expect(
      service.execute({
        tenantId: TENANT_A,
        profile: 'SUBMARINE' as unknown as 'MOTOR_VEHICLE',
      }),
    ).rejects.toThrow('Invalid profile');
  });

  it('rejects operating window when startAt is after or equal to endAt', async () => {
    const port: PlanningWorkspaceQueryPort = {
      getWorkspace: jest.fn(),
    };
    const service = new GetPlanningWorkspaceService(port);

    await expect(
      service.execute({
        tenantId: TENANT_A,
        window: {
          startAt: '2026-10-12T14:00:00.000Z',
          endAt: '2026-10-12T08:00:00.000Z',
        },
      }),
    ).rejects.toThrow('Invalid operating window');
  });
});
