import { Coordinates } from '../coordinates';
import {
    ClusteringExecutionOptions,
    ClusteringPackageInput,
    GeographicCluster,
    GeographicClusterMember,
} from '../models/clustering.types';
import { InvalidClusteringInputError } from '../models/invalid-clustering-input.error';
import { GeographicClusteringAlgorithm } from './geographic-clustering-algorithm';

function compareStringsOrdinal(a: string, b: string): number {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
}

export class RadiusClustering implements GeographicClusteringAlgorithm {
    public readonly name = 'radius-seed-first-fit';

    public cluster(
        packages: readonly ClusteringPackageInput[],
        options: ClusteringExecutionOptions,
    ): GeographicCluster[] {
        if (
            typeof options.radiusMeters !== 'number' ||
            !Number.isFinite(options.radiusMeters) ||
            options.radiusMeters <= 0
        ) {
            throw new InvalidClusteringInputError('INVALID_RADIUS');
        }

        if (packages.length === 0) {
            return [];
        }

        const seenPackageIds = new Set<string>();
        const packagesByZone = new Map<string, ClusteringPackageInput[]>();

        for (const pkg of packages) {
            if (pkg.tenantId !== options.tenantId) {
                throw new InvalidClusteringInputError('TENANT_MISMATCH');
            }

            if (seenPackageIds.has(pkg.packageId)) {
                throw new InvalidClusteringInputError('DUPLICATE_PACKAGE_ID');
            }
            seenPackageIds.add(pkg.packageId);

            const zonePkgs = packagesByZone.get(pkg.zoneId) ?? [];
            zonePkgs.push(pkg);
            packagesByZone.set(pkg.zoneId, zonePkgs);
        }

        const sortedZoneIds = Array.from(packagesByZone.keys()).sort(compareStringsOrdinal);
        const resultClusters: GeographicCluster[] = [];

        for (const zoneId of sortedZoneIds) {
            const remaining = [...(packagesByZone.get(zoneId) ?? [])].sort((a, b) =>
                compareStringsOrdinal(a.packageId, b.packageId),
            );

            while (remaining.length > 0) {
                const seed = remaining.shift()!;
                const clusterMembers: GeographicClusterMember[] = [
                    { packageId: seed.packageId, distanceToSeedMeters: 0 },
                ];

                const nonMembers: ClusteringPackageInput[] = [];

                for (const candidate of remaining) {
                    const distance = seed.coordinates.distanceTo(candidate.coordinates);
                    if (distance <= options.radiusMeters) {
                        clusterMembers.push({
                            packageId: candidate.packageId,
                            distanceToSeedMeters: distance,
                        });
                    } else {
                        nonMembers.push(candidate);
                    }
                }

                clusterMembers.sort((a, b) => {
                    if (a.distanceToSeedMeters !== b.distanceToSeedMeters) {
                        return a.distanceToSeedMeters - b.distanceToSeedMeters;
                    }
                    return compareStringsOrdinal(a.packageId, b.packageId);
                });

                resultClusters.push({
                    clusterId: `cluster-${zoneId}-${seed.packageId}`,
                    zoneId,
                    seedPackageId: seed.packageId,
                    packageIds: Object.freeze(clusterMembers.map((m) => m.packageId)),
                    memberDistances: Object.freeze(clusterMembers),
                });

                remaining.length = 0;
                remaining.push(...nonMembers);
            }
        }

        return resultClusters;
    }
}