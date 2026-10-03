import {
  Coordinates,
  ClusteringPackageInput,
  ClusteringVehicleInput,
  ClusteringExecutionOptions,
  InvalidClusteringInputError,
} from '../domain';
import { ClusterPackagesService } from '../application/cluster-packages.service';

const DEFAULT_TENANT_ID = 'tenant-test-1';
const DEFAULT_ZONE_ID = 'zone-norte';

function createPackageFixture(
  overrides: Partial<ClusteringPackageInput> = {},
): ClusteringPackageInput {
  return {
    packageId: 'PKG-001',
    tenantId: DEFAULT_TENANT_ID,
    zoneId: DEFAULT_ZONE_ID,
    coordinates: Coordinates.create(0, 0),
    weightKg: '5.000',
    volumeM3: '0.050000',
    ...overrides,
  };
}

function createVehicleFixture(
  overrides: Partial<ClusteringVehicleInput> = {},
): ClusteringVehicleInput {
  return {
    vehicleId: 'VEH-001',
    tenantId: DEFAULT_TENANT_ID,
    availableWeightKg: '50.000',
    availableVolumeM3: '1.000000',
    ...overrides,
  };
}

describe('ClusterPackagesService', () => {
  let service: ClusterPackagesService;
  let options: ClusteringExecutionOptions;

  beforeEach(() => {
    service = new ClusterPackagesService();
    options = {
      tenantId: DEFAULT_TENANT_ID,
      radiusMeters: 1000,
      algorithmVersion: '1',
    };
  });

  describe('execute', () => {
    it('orchestrates clustering and returns complete immutable result', () => {
      // Arrange
      const pkgA = createPackageFixture({
        packageId: 'PKG-001',
        coordinates: Coordinates.create(0, 0),
        weightKg: '10.000',
        volumeM3: '0.100000',
      });
      const pkgB = createPackageFixture({
        packageId: 'PKG-002',
        coordinates: Coordinates.create(0, 0.005),
        weightKg: '15.000',
        volumeM3: '0.150000',
      });
      const vehicle = createVehicleFixture({
        vehicleId: 'VEH-001',
        availableWeightKg: '30.000',
        availableVolumeM3: '0.500000',
      });

      // Act
      const result = service.execute(options, [pkgA, pkgB], [vehicle]);

      // Assert
      expect(result.tenantId).toBe(DEFAULT_TENANT_ID);
      expect(result.algorithm).toBe('radius-seed-first-fit');
      expect(result.version).toBe('1');
      expect(result.radiusMeters).toBe(1000);
      expect(result.geographicClusters).toHaveLength(1);
      expect(result.proposals).toHaveLength(1);
      expect(result.proposals[0].packageIds).toEqual(['PKG-001', 'PKG-002']);
      expect(result.proposals[0].totalWeightKg).toBe('25.000');
      expect(result.proposals[0].totalVolumeM3).toBe('0.250000');
      expect(result.pendingPackages).toHaveLength(0);
      expect(Object.isFrozen(result)).toBe(true);
    });

    it('rejects execution immediately when package tenant differs from options tenant', () => {
      // Arrange
      const pkgIntruder = createPackageFixture({
        packageId: 'PKG-001',
        tenantId: 'tenant-intruder',
      });
      const vehicle = createVehicleFixture();

      // Act & Assert
      expect(() => service.execute(options, [pkgIntruder], [vehicle])).toThrow(
        expect.objectContaining({
          name: 'InvalidClusteringInputError',
          reason: 'TENANT_MISMATCH',
        }),
      );
    });

    it('rejects execution immediately when vehicle tenant differs from options tenant', () => {
      // Arrange
      const pkg = createPackageFixture();
      const vehIntruder = createVehicleFixture({
        vehicleId: 'VEH-001',
        tenantId: 'tenant-intruder',
      });

      // Act & Assert
      expect(() => service.execute(options, [pkg], [vehIntruder])).toThrow(
        expect.objectContaining({
          name: 'InvalidClusteringInputError',
          reason: 'TENANT_MISMATCH',
        }),
      );
    });
  });
});
