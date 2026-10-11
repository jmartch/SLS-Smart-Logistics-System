export interface ShipmentTypeCatalogEntry {
    readonly id: string;
    readonly tenantId: string;
    readonly code: string;
    readonly name: string;
    readonly active: boolean;
}

export interface CreateShipmentTypeData {
    readonly code: string;
    readonly name: string;
    readonly active?: boolean;
}

export interface ListShipmentTypesFilter {
    readonly includeInactive?: boolean;
}

export type CreateShipmentTypeResult =
    | {
        readonly ok: true;
        readonly shipmentType: ShipmentTypeCatalogEntry;
    }
    | {
        readonly ok: false;
        readonly code: 'CATALOG_CODE_CONFLICT';
    };

export interface ShipmentTypeCatalogPort {
    listByTenant(
        tenantId: string,
        filter?: ListShipmentTypesFilter,
    ): Promise<readonly ShipmentTypeCatalogEntry[]>;

    findByTenant(
        tenantId: string,
        id: string,
    ): Promise<ShipmentTypeCatalogEntry | null>;

    createByTenant(
        tenantId: string,
        data: CreateShipmentTypeData,
    ): Promise<CreateShipmentTypeResult>;
}