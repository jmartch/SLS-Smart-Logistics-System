import {
  Coordinates,
  ClusteringPackageInput,
  ClusteringVehicleInput,
  GeographicCluster,
  InvalidClusteringInputError,
  FirstFitCapacityPartitioner,
} from '../domain';

const DEFAULT_TENANT_ID = 'tenant-test-1';
const DEFAULT_ZONE_ID = 'zone-norte';

function createPackageFixture(
  overrides: Partial<ClusteringPackageInput> = {},
): ClusteringPackageInput {
  return {
    packageId: 'PKG-001',
    tenantId: DEFAULT_TENANT_ID,
    zoneId: DEFAULT_ZONE_ID,
    coordinates: Coordinates.create(10.96854, -74.78132),
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

function createClusterFixture(
  clusterId: string,
  packageIds: string[],
): GeographicCluster {
  return {
    clusterId,
    zoneId: DEFAULT_ZONE_ID,
    seedPackageId: packageIds[0] ?? 'PKG-001',
    packageIds: Object.freeze([...packageIds]),
    memberDistances: Object.freeze(
      packageIds.map((id, index) => ({
        packageId: id,
        distanceToSeedMeters: index * 100,
      })),
    ),
  };
}

describe('FirstFitCapacityPartitioner', () => {
  let partitioner: FirstFitCapacityPartitioner;

  beforeEach(() => {
    partitioner = new FirstFitCapacityPartitioner();
  });

  describe('partition', () => {
    it('returns empty proposals and pending packages when packages list is empty', () => {
      // Arrange & Act
      const result = partitioner.partition([], [], [createVehicleFixture()]);

      // Assert
      expect(result.proposals).toEqual([]);
      expect(result.pendingPackages).toEqual([]);
    });

    it('marks all packages as NO_AVAILABLE_VEHICLE when vehicle fleet is empty', () => {
      // Arrange
      const pkg1 = createPackageFixture({ packageId: 'PKG-001' });
      const pkg2 = createPackageFixture({ packageId: 'PKG-002' });
      const cluster = createClusterFixture('cluster-1', ['PKG-001', 'PKG-002']);

      // Act
      const result = partitioner.partition([cluster], [pkg1, pkg2], []);

      // Assert
      expect(result.proposals).toHaveLength(0);
      expect(result.pendingPackages).toHaveLength(2);
      expect(result.pendingPackages[0]).toEqual({
        packageId: 'PKG-001',
        reason: 'NO_AVAILABLE_VEHICLE',
      });
      expect(result.pendingPackages[1]).toEqual({
        packageId: 'PKG-002',
        reason: 'NO_AVAILABLE_VEHICLE',
      });
    });

    it('assigns packages to a vehicle within weight and volume capacity', () => {
      // Arrange
      const pkgA = createPackageFixture({
        packageId: 'PKG-001',
        weightKg: '4.000',
        volumeM3: '0.200000',
      });
      const pkgB = createPackageFixture({
        packageId: 'PKG-002',
        weightKg: '6.000',
        volumeM3: '0.300000',
      });
      const vehicle = createVehicleFixture({
        vehicleId: 'VEH-001',
        availableWeightKg: '10.000',
        availableVolumeM3: '0.500000',
      });
      const cluster = createClusterFixture('cluster-1', ['PKG-001', 'PKG-002']);

      // Act
      const result = partitioner.partition([cluster], [pkgA, pkgB], [vehicle]);

      // Assert
      expect(result.pendingPackages).toHaveLength(0);
      expect(result.proposals).toHaveLength(1);
      const proposal = result.proposals[0];
      expect(proposal.proposalId).toBe('proposal-cluster-1-VEH-001');
      expect(proposal.candidateVehicleId).toBe('VEH-001');
      expect(proposal.packageIds).toEqual(['PKG-001', 'PKG-002']);
      expect(proposal.totalWeightKg).toBe('10.000');
      expect(proposal.totalVolumeM3).toBe('0.500000');
    });

    it('opens a second proposal with another vehicle when first vehicle capacity is exhausted', () => {
      // Arrange
      const pkgA = createPackageFixture({
        packageId: 'PKG-001',
        weightKg: '4.000',
        volumeM3: '0.200000',
      });
      const pkgB = createPackageFixture({
        packageId: 'PKG-002',
        weightKg: '6.000',
        volumeM3: '0.300000',
      });
      const pkgC = createPackageFixture({
        packageId: 'PKG-003',
        weightKg: '1.000',
        volumeM3: '0.100000',
      });

      const veh1 = createVehicleFixture({
        vehicleId: 'VEH-001',
        availableWeightKg: '10.000',
        availableVolumeM3: '0.500000',
      });
      const veh2 = createVehicleFixture({
        vehicleId: 'VEH-002',
        availableWeightKg: '5.000',
        availableVolumeM3: '0.250000',
      });

      const cluster = createClusterFixture('cluster-1', [
        'PKG-001',
        'PKG-002',
        'PKG-003',
      ]);

      // Act
      const result = partitioner.partition(
        [cluster],
        [pkgA, pkgB, pkgC],
        [veh1, veh2],
      );

      // Assert
      expect(result.pendingPackages).toHaveLength(0);
      expect(result.proposals).toHaveLength(2);
      expect(result.proposals[0].candidateVehicleId).toBe('VEH-001');
      expect(result.proposals[0].packageIds).toEqual(['PKG-001', 'PKG-002']);
      expect(result.proposals[1].candidateVehicleId).toBe('VEH-002');
      expect(result.proposals[1].packageIds).toEqual(['PKG-003']);
    });

    it('marks package as WEIGHT_CAPACITY_EXCEEDED when weight exceeds all vehicles in snapshot', () => {
      // Arrange
      const heavyPkg = createPackageFixture({
        packageId: 'PKG-HEAVY',
        weightKg: '100.000',
        volumeM3: '0.100000',
      });
      const veh = createVehicleFixture({
        availableWeightKg: '50.000',
        availableVolumeM3: '1.000000',
      });
      const cluster = createClusterFixture('cluster-1', ['PKG-HEAVY']);

      // Act
      const result = partitioner.partition([cluster], [heavyPkg], [veh]);

      // Assert
      expect(result.proposals).toHaveLength(0);
      expect(result.pendingPackages).toEqual([
        { packageId: 'PKG-HEAVY', reason: 'WEIGHT_CAPACITY_EXCEEDED' },
      ]);
    });

    it('marks package as VOLUME_CAPACITY_EXCEEDED when volume exceeds all vehicles in snapshot', () => {
      // Arrange
      const bulkyPkg = createPackageFixture({
        packageId: 'PKG-BULKY',
        weightKg: '10.000',
        volumeM3: '2.000000',
      });
      const veh = createVehicleFixture({
        availableWeightKg: '50.000',
        availableVolumeM3: '1.000000',
      });
      const cluster = createClusterFixture('cluster-1', ['PKG-BULKY']);

      // Act
      const result = partitioner.partition([cluster], [bulkyPkg], [veh]);

      // Assert
      expect(result.proposals).toHaveLength(0);
      expect(result.pendingPackages).toEqual([
        { packageId: 'PKG-BULKY', reason: 'VOLUME_CAPACITY_EXCEEDED' },
      ]);
    });

    it('marks package as NO_JOINT_CAPACITY when individual magnitudes fit separate vehicles but no single vehicle supports both', () => {
      // Arrange
      // Paquete necesita 5 kg y 0.5 m3
      const pkg = createPackageFixture({
        packageId: 'PKG-001',
        weightKg: '5.000',
        volumeM3: '0.500000',
      });
      // V1 soporta peso (10 kg), pero no volumen (0.1 m3)
      const v1 = createVehicleFixture({
        vehicleId: 'VEH-001',
        availableWeightKg: '10.000',
        availableVolumeM3: '0.100000',
      });
      // V2 soporta volumen (1.0 m3), pero no peso (1 kg)
      const v2 = createVehicleFixture({
        vehicleId: 'VEH-002',
        availableWeightKg: '1.000',
        availableVolumeM3: '1.000000',
      });
      const cluster = createClusterFixture('cluster-1', ['PKG-001']);

      // Act
      const result = partitioner.partition([cluster], [pkg], [v1, v2]);

      // Assert
      expect(result.proposals).toHaveLength(0);
      expect(result.pendingPackages).toEqual([
        { packageId: 'PKG-001', reason: 'NO_JOINT_CAPACITY' },
      ]);
    });

    it('marks package as CAPACITY_EXHAUSTED_BY_HEURISTIC when vehicles existed initially but are consumed', () => {
      // Arrange
      const pkg1 = createPackageFixture({
        packageId: 'PKG-001',
        weightKg: '10.000',
        volumeM3: '0.500000',
      });
      const pkg2 = createPackageFixture({
        packageId: 'PKG-002',
        weightKg: '5.000',
        volumeM3: '0.200000',
      });
      const veh = createVehicleFixture({
        vehicleId: 'VEH-001',
        availableWeightKg: '10.000',
        availableVolumeM3: '0.500000',
      });
      const cluster = createClusterFixture('cluster-1', ['PKG-001', 'PKG-002']);

      // Act
      const result = partitioner.partition([cluster], [pkg1, pkg2], [veh]);

      // Assert: pkg1 se asigna y agota a VEH-001; pkg2 cabía inicialmente pero quedó agotado
      expect(result.proposals).toHaveLength(1);
      expect(result.proposals[0].packageIds).toEqual(['PKG-001']);
      expect(result.pendingPackages).toEqual([
        { packageId: 'PKG-002', reason: 'CAPACITY_EXHAUSTED_BY_HEURISTIC' },
      ]);
    });

    it('continues evaluating subsequent packages when a preceding package is pending', () => {
      // Arrange
      const hugePkg = createPackageFixture({
        packageId: 'PKG-001',
        weightKg: '100.000',
        volumeM3: '5.000000',
      });
      const normalPkg = createPackageFixture({
        packageId: 'PKG-002',
        weightKg: '5.000',
        volumeM3: '0.100000',
      });
      const veh = createVehicleFixture({
        vehicleId: 'VEH-001',
        availableWeightKg: '20.000',
        availableVolumeM3: '1.000000',
      });
      const cluster = createClusterFixture('cluster-1', ['PKG-001', 'PKG-002']);

      // Act
      const result = partitioner.partition([cluster], [hugePkg, normalPkg], [veh]);

      // Assert: hugePkg es rechazado, pero normalPkg es propuesto
      expect(result.pendingPackages).toHaveLength(1);
      expect(result.pendingPackages[0].packageId).toBe('PKG-001');
      expect(result.proposals).toHaveLength(1);
      expect(result.proposals[0].packageIds).toEqual(['PKG-002']);
    });

    it('does not reuse a vehicle across different clusters in the same execution', () => {
      // Arrange
      const pkg1 = createPackageFixture({ packageId: 'PKG-001' });
      const pkg2 = createPackageFixture({ packageId: 'PKG-002' });
      const singleVeh = createVehicleFixture({
        vehicleId: 'VEH-001',
        availableWeightKg: '100.000',
        availableVolumeM3: '5.000000',
      });
      const clusterA = createClusterFixture('cluster-A', ['PKG-001']);
      const clusterB = createClusterFixture('cluster-B', ['PKG-002']);

      // Act
      const result = partitioner.partition(
        [clusterA, clusterB],
        [pkg1, pkg2],
        [singleVeh],
      );

      // Assert: VEH-001 se asigna a cluster-A; cluster-B no puede reusar VEH-001
      expect(result.proposals).toHaveLength(1);
      expect(result.proposals[0].clusterId).toBe('cluster-A');
      expect(result.pendingPackages).toHaveLength(1);
      expect(result.pendingPackages[0].packageId).toBe('PKG-002');
      expect(result.pendingPackages[0].reason).toBe(
        'CAPACITY_EXHAUSTED_BY_HEURISTIC',
      );
    });

    it('throws TENANT_MISMATCH when a vehicle belongs to another tenant', () => {
      // Arrange
      const pkg = createPackageFixture();
      const veh = createVehicleFixture({ tenantId: 'tenant-intruder' });
      const cluster = createClusterFixture('cluster-1', ['PKG-001']);

      // Act & Assert
      expect(() => partitioner.partition([cluster], [pkg], [veh])).toThrow(
        expect.objectContaining({
          name: 'InvalidClusteringInputError',
          reason: 'TENANT_MISMATCH',
        }),
      );
    });

    it('throws DUPLICATE_VEHICLE_ID when multiple vehicles share the same ID', () => {
      // Arrange
      const pkg = createPackageFixture();
      const veh1 = createVehicleFixture({ vehicleId: 'VEH-001' });
      const veh2 = createVehicleFixture({ vehicleId: 'VEH-001' });
      const cluster = createClusterFixture('cluster-1', ['PKG-001']);

      // Act & Assert
      expect(() => partitioner.partition([cluster], [pkg], [veh1, veh2])).toThrow(
        expect.objectContaining({
          name: 'InvalidClusteringInputError',
          reason: 'DUPLICATE_VEHICLE_ID',
        }),
      );
    });
  });
});
