import {
    PackageQueryPort,
    type PackageListItem,
} from './ports/package-query.port';

export class ListPackagesUseCase {
    constructor(private readonly packages: PackageQueryPort) {}

    execute(tenantId: string): Promise<PackageListItem[]> {
        return this.packages.listByTenant(tenantId);
    }
}
