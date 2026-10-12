export interface PackageListItem {
    readonly id: string;
    readonly trackingCode: string;
    readonly state: string;
    readonly priority: string;
    readonly weightKg: string;
    readonly volumeM3: string;
    readonly address: string;
    readonly zone: string | null;
    readonly sector: string | null;
    readonly shipmentType: string;
    readonly registeredAt: Date | null;
}

export interface PackageHistoryItem {
    readonly fromState: string | null;
    readonly toState: string;
    readonly reasonCode: string | null;
    readonly changedBy: string | null;
    readonly createdAt: Date;
}

export interface PackageDetail extends PackageListItem {
    readonly lengthCm: string;
    readonly widthCm: string;
    readonly heightCm: string;
    readonly deadline: Date | null;
    readonly history: readonly PackageHistoryItem[];
}

export abstract class PackageQueryPort {
    abstract listByTenant(tenantId: string): Promise<PackageListItem[]>;
    abstract findByTenantAndId(
        tenantId: string,
        packageId: string,
    ): Promise<PackageDetail | null>;
}
