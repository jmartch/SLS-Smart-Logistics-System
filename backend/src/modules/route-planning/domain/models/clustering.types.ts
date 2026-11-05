import { Coordinates } from '../coordinates';

export type ClusteringPendingReason =
    | 'NO_AVAILABLE_VEHICLE'
    | 'WEIGHT_CAPACITY_EXCEEDED'
    | 'VOLUME_CAPACITY_EXCEEDED'
    | 'NO_JOINT_CAPACITY'
    | 'CAPACITY_EXHAUSTED_BY_HEURISTIC';

export interface ClusteringPackageInput {
    readonly packageId: string;
    readonly tenantId: string;
    readonly zoneId: string;
    readonly coordinates: Coordinates;
    readonly weightKg: string;
    readonly volumeM3: string;
}

export interface ClusteringVehicleInput {
    readonly vehicleId: string;
    readonly tenantId: string;
    readonly availableWeightKg: string;
    readonly availableVolumeM3: string;
}

export interface ClusteringExecutionOptions {
    readonly tenantId: string;
    readonly radiusMeters: number;
    readonly algorithmVersion?: string;
}

export interface GeographicClusterMember {
    readonly packageId: string;
    readonly distanceToSeedMeters: number;
}

export interface GeographicCluster {
    readonly clusterId: string;
    readonly zoneId: string;
    readonly seedPackageId: string;
    readonly packageIds: readonly string[];
    readonly memberDistances: readonly GeographicClusterMember[];
}

export interface CapacityClusterProposal {
    readonly proposalId: string;
    readonly clusterId: string;
    readonly candidateVehicleId: string;
    readonly packageIds: readonly string[];
    readonly totalWeightKg: string;
    readonly totalVolumeM3: string;
}

export interface ClusteringPendingPackage {
    readonly packageId: string;
    readonly reason: ClusteringPendingReason;
    readonly details?: string;
}

export interface ClusteringResult {
    readonly tenantId: string;
    readonly algorithm: string;
    readonly version: string;
    readonly radiusMeters: number;
    readonly geographicClusters: readonly GeographicCluster[];
    readonly proposals: readonly CapacityClusterProposal[];
    readonly pendingPackages: readonly ClusteringPendingPackage[];
}