import {
    CapacityClusterProposal,
    ClusteringPackageInput,
    ClusteringPendingPackage,
    ClusteringPendingReason,
    ClusteringVehicleInput,
    GeographicCluster,
} from '../models/clustering.types';
import { InvalidClusteringInputError } from '../models/invalid-clustering-input.error';
import {
    cm3ToM3,
    gramsToKg,
    parseKgToGrams,
    parseM3ToCm3,
} from '../models/clustering-quantities';

function compareStringsOrdinal(a: string, b: string): number {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
}

interface NormalizedPackage {
    readonly packageId: string;
    readonly tenantId: string;
    readonly weightGrams: number;
    readonly volumeCm3: number;
}

interface VehicleState {
    readonly vehicleId: string;
    readonly tenantId: string;
    readonly initialGrams: number;
    readonly initialCm3: number;
    availableGrams: number;
    availableCm3: number;
    committed: boolean;
}

interface OpenProposal {
    readonly proposalId: string;
    readonly clusterId: string;
    readonly candidateVehicleId: string;
    readonly packageIds: string[];
    usedGrams: number;
    usedCm3: number;
}

export class FirstFitCapacityPartitioner {
    public readonly name = 'first-fit';

    public partition(
        clusters: readonly GeographicCluster[],
        packages: readonly ClusteringPackageInput[],
        vehicles: readonly ClusteringVehicleInput[],
    ): {
        readonly proposals: readonly CapacityClusterProposal[];
        readonly pendingPackages: readonly ClusteringPendingPackage[];
    } {
        if (packages.length === 0) {
            return { proposals: [], pendingPackages: [] };
        }

        const tenantId = packages[0].tenantId;

        // 1. Normalizar paquetes
        const packageMap = new Map<string, NormalizedPackage>();
        for (const pkg of packages) {
            if (pkg.tenantId !== tenantId) {
                throw new InvalidClusteringInputError('TENANT_MISMATCH');
            }
            packageMap.set(pkg.packageId, {
                packageId: pkg.packageId,
                tenantId: pkg.tenantId,
                weightGrams: parseKgToGrams(pkg.weightKg, false),
                volumeCm3: parseM3ToCm3(pkg.volumeM3, false),
            });
        }

        // 2. Normalizar y ordenar vehículos
        const seenVehicleIds = new Set<string>();
        const vehicleStates: VehicleState[] = [];

        for (const v of vehicles) {
            if (v.tenantId !== tenantId) {
                throw new InvalidClusteringInputError('TENANT_MISMATCH');
            }
            if (seenVehicleIds.has(v.vehicleId)) {
                throw new InvalidClusteringInputError('DUPLICATE_VEHICLE_ID');
            }
            seenVehicleIds.add(v.vehicleId);

            const grams = parseKgToGrams(v.availableWeightKg, true);
            const cm3 = parseM3ToCm3(v.availableVolumeM3, true);
            vehicleStates.push({
                vehicleId: v.vehicleId,
                tenantId: v.tenantId,
                initialGrams: grams,
                initialCm3: cm3,
                availableGrams: grams,
                availableCm3: cm3,
                committed: false,
            });
        }

        vehicleStates.sort((a, b) => compareStringsOrdinal(a.vehicleId, b.vehicleId));

        // Si no hay vehículos, todos los paquetes van a pendientes
        if (vehicleStates.length === 0) {
            const allPending: ClusteringPendingPackage[] = [];
            for (const cluster of clusters) {
                for (const pkgId of cluster.packageIds) {
                    allPending.push({
                        packageId: pkgId,
                        reason: 'NO_AVAILABLE_VEHICLE',
                    });
                }
            }
            return { proposals: [], pendingPackages: allPending };
        }

        const proposalsByCluster = new Map<string, OpenProposal[]>();
        const pendingPackages: ClusteringPendingPackage[] = [];

        for (const cluster of clusters) {
            const openProposals: OpenProposal[] = [];
            proposalsByCluster.set(cluster.clusterId, openProposals);

            for (const pkgId of cluster.packageIds) {
                const pkg = packageMap.get(pkgId);
                if (!pkg) continue;

                let assigned = false;

                // Intentar en propuestas abiertas del cluster
                for (const proposal of openProposals) {
                    const vehicle = vehicleStates.find((v) => v.vehicleId === proposal.candidateVehicleId)!;
                    if (
                        vehicle.availableGrams >= pkg.weightGrams &&
                        vehicle.availableCm3 >= pkg.volumeCm3
                    ) {
                        proposal.packageIds.push(pkg.packageId);
                        proposal.usedGrams += pkg.weightGrams;
                        proposal.usedCm3 += pkg.volumeCm3;
                        vehicle.availableGrams -= pkg.weightGrams;
                        vehicle.availableCm3 -= pkg.volumeCm3;
                        assigned = true;
                        break;
                    }
                }

                if (assigned) continue;

                // Buscar un nuevo vehículo disponible en la flota
                const candidateVehicle = vehicleStates.find(
                    (v) => !v.committed && v.availableGrams >= pkg.weightGrams && v.availableCm3 >= pkg.volumeCm3,
                );

                if (candidateVehicle) {
                    candidateVehicle.committed = true;
                    candidateVehicle.availableGrams -= pkg.weightGrams;
                    candidateVehicle.availableCm3 -= pkg.volumeCm3;

                    openProposals.push({
                        proposalId: `proposal-${cluster.clusterId}-${candidateVehicle.vehicleId}`,
                        clusterId: cluster.clusterId,
                        candidateVehicleId: candidateVehicle.vehicleId,
                        packageIds: [pkg.packageId],
                        usedGrams: pkg.weightGrams,
                        usedCm3: pkg.volumeCm3,
                    });
                    assigned = true;
                    continue;
                }

                // Si no se pudo asignar, evaluar la razón de rechazo
                const reason = this.resolvePendingReason(pkg, vehicleStates);
                pendingPackages.push({
                    packageId: pkg.packageId,
                    reason,
                });
            }
        }

        const finalProposals: CapacityClusterProposal[] = [];
        for (const cluster of clusters) {
            const clusterProposals = proposalsByCluster.get(cluster.clusterId) ?? [];
            for (const prop of clusterProposals) {
                finalProposals.push({
                    proposalId: prop.proposalId,
                    clusterId: prop.clusterId,
                    candidateVehicleId: prop.candidateVehicleId,
                    packageIds: Object.freeze([...prop.packageIds]),
                    totalWeightKg: gramsToKg(prop.usedGrams),
                    totalVolumeM3: cm3ToM3(prop.usedCm3),
                });
            }
        }

        return {
            proposals: Object.freeze(finalProposals),
            pendingPackages: Object.freeze(pendingPackages),
        };
    }

    private resolvePendingReason(
        pkg: NormalizedPackage,
        vehicles: readonly VehicleState[],
    ): ClusteringPendingReason {
        const hasWeightFit = vehicles.some((v) => v.initialGrams >= pkg.weightGrams);
        if (!hasWeightFit) {
            return 'WEIGHT_CAPACITY_EXCEEDED';
        }

        const hasVolumeFit = vehicles.some((v) => v.initialCm3 >= pkg.volumeCm3);
        if (!hasVolumeFit) {
            return 'VOLUME_CAPACITY_EXCEEDED';
        }

        const hasJointFit = vehicles.some(
            (v) => v.initialGrams >= pkg.weightGrams && v.initialCm3 >= pkg.volumeCm3,
        );
        if (!hasJointFit) {
            return 'NO_JOINT_CAPACITY';
        }

        return 'CAPACITY_EXHAUSTED_BY_HEURISTIC';
    }
}
