import {
    type ClusteringExecutionOptions,
    type ClusteringPackageInput,
    type ClusteringResult,
    type ClusteringVehicleInput,
    type GeographicClusteringAlgorithm,
    RadiusClustering,
    FirstFitCapacityPartitioner,
    InvalidClusteringInputError,
} from '../domain';

export class ClusterPackagesService {
    public constructor(
        private readonly clusteringAlgorithm: GeographicClusteringAlgorithm = new RadiusClustering(),
        private readonly capacityPartitioner: FirstFitCapacityPartitioner = new FirstFitCapacityPartitioner(),
    ) { }

    public execute(
        options: ClusteringExecutionOptions,
        packages: readonly ClusteringPackageInput[],
        vehicles: readonly ClusteringVehicleInput[],
    ): ClusteringResult {
        for (const pkg of packages) {
            if (pkg.tenantId !== options.tenantId) {
                throw new InvalidClusteringInputError('TENANT_MISMATCH');
            }
        }
        for (const veh of vehicles) {
            if (veh.tenantId !== options.tenantId) {
                throw new InvalidClusteringInputError('TENANT_MISMATCH');
            }
        }

        const geographicClusters = this.clusteringAlgorithm.cluster(
            packages,
            options,
        );

        const { proposals, pendingPackages } = this.capacityPartitioner.partition(
            geographicClusters,
            packages,
            vehicles,
        );

        return Object.freeze({
            tenantId: options.tenantId,
            algorithm: this.clusteringAlgorithm.name,
            version: options.algorithmVersion ?? '1',
            radiusMeters: options.radiusMeters,
            geographicClusters,
            proposals,
            pendingPackages,
        });
    }
}
