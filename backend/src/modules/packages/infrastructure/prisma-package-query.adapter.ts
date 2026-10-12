import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { runWithTenant } from '../../../database/run-with-tenant';
import {
    PackageQueryPort,
    type PackageListItem,
} from '../application/ports/package-query.port';

@Injectable()
export class PrismaPackageQueryAdapter extends PackageQueryPort {
    constructor(private readonly prisma: PrismaService) {
        super();
    }

    async listByTenant(tenantId: string): Promise<PackageListItem[]> {
        const packages = await runWithTenant(this.prisma, tenantId, (tx) =>
            tx.package.findMany({
                where: { tenantId },
                orderBy: { trackingCode: 'desc' },
                select: {
                    id: true,
                    trackingCode: true,
                    state: true,
                    priority: true,
                    weightKg: true,
                    volumeM3: true,
                    address: { select: { originalText: true } },
                    zone: { select: { name: true } },
                    sector: { select: { name: true } },
                    shipmentType: { select: { name: true } },
                    statusHistory: {
                        orderBy: { createdAt: 'asc' },
                        take: 1,
                        select: { createdAt: true },
                    },
                },
            }),
        );

        return packages.map((pkg) => ({
            id: pkg.id,
            trackingCode: pkg.trackingCode,
            state: pkg.state,
            priority: pkg.priority,
            weightKg: String(pkg.weightKg),
            volumeM3: String(pkg.volumeM3),
            address: pkg.address.originalText,
            zone: pkg.zone?.name ?? null,
            sector: pkg.sector?.name ?? null,
            shipmentType: pkg.shipmentType.name,
            registeredAt: pkg.statusHistory[0]?.createdAt ?? null,
        }));
    }
}
