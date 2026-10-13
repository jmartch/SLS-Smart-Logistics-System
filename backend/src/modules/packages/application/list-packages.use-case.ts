import {
    PackageQueryPort,
    type PackageListFilter,
    type PackageListItem,
} from './ports/package-query.port';

export class ListPackagesUseCase {
    constructor(private readonly packages: PackageQueryPort) {}

    execute(
        tenantId: string,
        filter?: PackageListFilter,
    ): Promise<PackageListItem[]> {
        if (filter) {
            return this.packages.listByTenant(tenantId, filter);
        }
        return this.packages.listByTenant(tenantId);
    }
}
