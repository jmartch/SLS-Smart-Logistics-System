import { ClusteringExecutionOptions, ClusteringPackageInput, GeographicCluster } from '../models/clustering.types';

export interface GeographicClusteringAlgorithm {
    readonly name: string;

    cluster(
        packages: readonly ClusteringPackageInput[],
        options: ClusteringExecutionOptions,
    ): GeographicCluster[];
}