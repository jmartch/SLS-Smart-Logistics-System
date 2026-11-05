import { PackageNotFoundError } from '../domain/package-errors';
import {
    PackageQueryPort,
    type PackageDetail,
} from './ports/package-query.port';

export class GetPackageDetailUseCase {
    constructor(private readonly packages: PackageQueryPort) {}

    async execute(tenantId: string, packageId: string): Promise<PackageDetail> {
        const detail = await this.packages.findByTenantAndId(
            tenantId,
            packageId,
        );
        if (!detail) {
            throw new PackageNotFoundError(packageId);
        }
        return detail;
    }
}
