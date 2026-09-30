export interface GeocodingAddress {
    readonly id: string;
    readonly tenantId: string;
    readonly originalText: string;
    readonly municipalityCode: string;
}

export interface FindGeocodingAddressQuery {
    readonly tenantId: string;
    readonly addressId: string;
}

export interface GeocodingAddressPort {
    findByTenant(
        query: FindGeocodingAddressQuery,
    ): Promise<GeocodingAddress | null>;
}