export interface PackageGeocodingCommand {
    readonly tenantId: string;
    readonly packageId: string;
    readonly addressId: string;
}

export interface PackageGeocodingPort {
    geocodeAndAttach(command: PackageGeocodingCommand): Promise<void>;
}
