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

export abstract class PackageQueryPort {
    abstract listByTenant(tenantId: string): Promise<PackageListItem[]>;
}
