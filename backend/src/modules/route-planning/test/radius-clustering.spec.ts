import {
    Coordinates,
    ClusteringPackageInput,
    ClusteringExecutionOptions,
    InvalidClusteringInputError,
    RadiusClustering,
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
        coordinates: Coordinates.create(0, 0),
        weightKg: '5.000',
        volumeM3: '0.050000',
        ...overrides,
    };
}

describe('RadiusClustering', () => {
    let algorithm: RadiusClustering;
    let defaultOptions: ClusteringExecutionOptions;

    beforeEach(() => {
        algorithm = new RadiusClustering();
        defaultOptions = {
            tenantId: DEFAULT_TENANT_ID,
            radiusMeters: 1000,
            algorithmVersion: '1',
        };
    });

    describe('cluster', () => {
        it('returns empty array when packages list is empty', () => {
            // Arrange
            const packages: ClusteringPackageInput[] = [];

            // Act
            const result = algorithm.cluster(packages, defaultOptions);

            // Assert
            expect(result).toEqual([]);
        });

        it('groups packages within radius from seed package', () => {
            // Arrange
            // Distancia (0,0) a (0, 0.005) es ~556m (menor a 1000m)
            const pkgA = createPackageFixture({
                packageId: 'PKG-001',
                coordinates: Coordinates.create(0, 0),
            });
            const pkgB = createPackageFixture({
                packageId: 'PKG-002',
                coordinates: Coordinates.create(0, 0.005),
            });

            // Act
            const result = algorithm.cluster([pkgA, pkgB], defaultOptions);

            // Assert
            expect(result).toHaveLength(1);
            expect(result[0].clusterId).toBe(`cluster-${DEFAULT_ZONE_ID}-PKG-001`);
            expect(result[0].seedPackageId).toBe('PKG-001');
            expect(result[0].packageIds).toEqual(['PKG-001', 'PKG-002']);
            expect(result[0].memberDistances[0].packageId).toBe('PKG-001');
            expect(result[0].memberDistances[0].distanceToSeedMeters).toBe(0);
            expect(result[0].memberDistances[1].packageId).toBe('PKG-002');
            expect(result[0].memberDistances[1].distanceToSeedMeters).toBeGreaterThan(0);
            expect(result[0].memberDistances[1].distanceToSeedMeters).toBeLessThanOrEqual(1000);
        });

        it('creates separate clusters when distance exceeds radius', () => {
            // Arrange
            // Distancia (0,0) a (0, 0.03) es ~3336m (mayor a 1000m)
            const pkgA = createPackageFixture({
                packageId: 'PKG-001',
                coordinates: Coordinates.create(0, 0),
            });
            const pkgFar = createPackageFixture({
                packageId: 'PKG-002',
                coordinates: Coordinates.create(0, 0.03),
            });

            // Act
            const result = algorithm.cluster([pkgA, pkgFar], defaultOptions);

            // Assert
            expect(result).toHaveLength(2);
            expect(result[0].clusterId).toBe(`cluster-${DEFAULT_ZONE_ID}-PKG-001`);
            expect(result[0].packageIds).toEqual(['PKG-001']);
            expect(result[1].clusterId).toBe(`cluster-${DEFAULT_ZONE_ID}-PKG-002`);
            expect(result[1].packageIds).toEqual(['PKG-002']);
        });

        it('orders cluster members by distance to seed ascending and breaks ties by packageId', () => {
            // Arrange
            // Semilla: PKG-001 en (0,0)
            // PKG-002 y PKG-003 están en las mismas coordenadas a ~556m
            const pkgA = createPackageFixture({
                packageId: 'PKG-001',
                coordinates: Coordinates.create(0, 0),
            });
            const pkgC = createPackageFixture({
                packageId: 'PKG-003',
                coordinates: Coordinates.create(0, 0.005),
            });
            const pkgB = createPackageFixture({
                packageId: 'PKG-002',
                coordinates: Coordinates.create(0, 0.005),
            });

            // Act
            const result = algorithm.cluster([pkgA, pkgC, pkgB], defaultOptions);

            // Assert
            expect(result).toHaveLength(1);
            // PKG-001 (dist 0) -> PKG-002 (dist ~556) -> PKG-003 (dist ~556)
            expect(result[0].packageIds).toEqual(['PKG-001', 'PKG-002', 'PKG-003']);
        });

        it('isolates packages by zone even when geographic distance is within radius', () => {
            // Arrange
            const pkgZone1 = createPackageFixture({
                packageId: 'PKG-001',
                zoneId: 'ZONE-A',
                coordinates: Coordinates.create(0, 0),
            });
            const pkgZone2 = createPackageFixture({
                packageId: 'PKG-002',
                zoneId: 'ZONE-B',
                coordinates: Coordinates.create(0, 0.001), // muy cerca (~111m)
            });

            // Act
            const result = algorithm.cluster([pkgZone1, pkgZone2], defaultOptions);

            // Assert
            expect(result).toHaveLength(2);
            expect(result[0].zoneId).toBe('ZONE-A');
            expect(result[0].packageIds).toEqual(['PKG-001']);
            expect(result[1].zoneId).toBe('ZONE-B');
            expect(result[1].packageIds).toEqual(['PKG-002']);
        });

        it('maintains deterministic output when package input array order is permuted', () => {
            // Arrange
            const pkg1 = createPackageFixture({
                packageId: 'PKG-001',
                coordinates: Coordinates.create(0, 0),
            });
            const pkg2 = createPackageFixture({
                packageId: 'PKG-002',
                coordinates: Coordinates.create(0, 0.003),
            });
            const pkg3 = createPackageFixture({
                packageId: 'PKG-003',
                coordinates: Coordinates.create(0, 0.007),
            });
            const pkg4 = createPackageFixture({
                packageId: 'PKG-004',
                coordinates: Coordinates.create(0, 0.020),
            });

            const forwardOrder = [pkg1, pkg2, pkg3, pkg4];
            const reverseOrder = [pkg4, pkg3, pkg2, pkg1];
            const mixedOrder = [pkg3, pkg1, pkg4, pkg2];

            // Act
            const resForward = algorithm.cluster(forwardOrder, defaultOptions);
            const resReverse = algorithm.cluster(reverseOrder, defaultOptions);
            const resMixed = algorithm.cluster(mixedOrder, defaultOptions);

            // Assert: igualdad completa de clusters generados
            expect(resForward).toEqual(resReverse);
            expect(resForward).toEqual(resMixed);
        });

        it('handles boundary condition where distance equals radius exactly', () => {
            // Arrange
            const seed = createPackageFixture({
                packageId: 'PKG-001',
                coordinates: Coordinates.create(0, 0),
            });
            const candidate = createPackageFixture({
                packageId: 'PKG-002',
                coordinates: Coordinates.create(0, 0.005),
            });
            const exactDistance = seed.coordinates.distanceTo(candidate.coordinates);

            // Act: radio exacto
            const inclusiveResult = algorithm.cluster([seed, candidate], {
                ...defaultOptions,
                radiusMeters: exactDistance,
            });

            // Act: radio 1 metro menor
            const exclusiveResult = algorithm.cluster([seed, candidate], {
                ...defaultOptions,
                radiusMeters: exactDistance - 1,
            });

            // Assert
            expect(inclusiveResult).toHaveLength(1);
            expect(inclusiveResult[0].packageIds).toEqual(['PKG-001', 'PKG-002']);

            expect(exclusiveResult).toHaveLength(2);
            expect(exclusiveResult[0].packageIds).toEqual(['PKG-001']);
            expect(exclusiveResult[1].packageIds).toEqual(['PKG-002']);
        });

        it('preserves immutability of input packages collection', () => {
            // Arrange
            const pkg1 = createPackageFixture({ packageId: 'PKG-001' });
            const pkg2 = createPackageFixture({ packageId: 'PKG-002' });
            const originalArray = [pkg1, pkg2];
            Object.freeze(originalArray);

            // Act & Assert (no debe lanzar error de mutación)
            expect(() => algorithm.cluster(originalArray, defaultOptions)).not.toThrow();
        });

        it('throws TENANT_MISMATCH when a package belongs to another tenant', () => {
            // Arrange
            const pkgA = createPackageFixture({ tenantId: DEFAULT_TENANT_ID });
            const pkgB = createPackageFixture({
                packageId: 'PKG-002',
                tenantId: 'tenant-other',
            });

            // Act & Assert
            expect(() => algorithm.cluster([pkgA, pkgB], defaultOptions)).toThrow(
                expect.objectContaining({
                    name: 'InvalidClusteringInputError',
                    reason: 'TENANT_MISMATCH',
                }),
            );
        });

        it('throws DUPLICATE_PACKAGE_ID when multiple packages share the same ID', () => {
            // Arrange
            const pkg1 = createPackageFixture({ packageId: 'PKG-001' });
            const pkg2 = createPackageFixture({ packageId: 'PKG-001' });

            // Act & Assert
            expect(() => algorithm.cluster([pkg1, pkg2], defaultOptions)).toThrow(
                expect.objectContaining({
                    name: 'InvalidClusteringInputError',
                    reason: 'DUPLICATE_PACKAGE_ID',
                }),
            );
        });

        it('throws INVALID_RADIUS when radius is zero, negative, non-finite or NaN', () => {
            // Arrange
            const pkg = createPackageFixture();

            // Act & Assert
            expect(() =>
                algorithm.cluster([pkg], { ...defaultOptions, radiusMeters: 0 }),
            ).toThrow(expect.objectContaining({ reason: 'INVALID_RADIUS' }));

            expect(() =>
                algorithm.cluster([pkg], { ...defaultOptions, radiusMeters: -500 }),
            ).toThrow(expect.objectContaining({ reason: 'INVALID_RADIUS' }));

            expect(() =>
                algorithm.cluster([pkg], { ...defaultOptions, radiusMeters: NaN }),
            ).toThrow(expect.objectContaining({ reason: 'INVALID_RADIUS' }));

            expect(() =>
                algorithm.cluster([pkg], { ...defaultOptions, radiusMeters: Infinity }),
            ).toThrow(expect.objectContaining({ reason: 'INVALID_RADIUS' }));
        });
    });
});
