export type PackageRegistrationField =
    | 'trackingCode'
    | 'address'
    | 'municipalityCode'
    | 'shipmentTypeId'
    | 'zoneId'
    | 'sectorId'
    | 'weightKg'
    | 'lengthCm'
    | 'widthCm'
    | 'heightCm'
    | 'volumeM3'
    | 'priority'
    | 'deadline'
    | 'serviceDurationSeconds';

export type InvalidPackageRegistrationReason =
    | 'REQUIRED'
    | 'INVALID_FORMAT'
    | 'NOT_POSITIVE'
    | 'TOO_MANY_DECIMALS'
    | 'OUT_OF_RANGE'
    | 'SECTOR_REQUIRES_ZONE';

export class InvalidPackageRegistrationError extends Error {
    constructor(
        readonly field: PackageRegistrationField,
        readonly reason: InvalidPackageRegistrationReason,
    ) {
        super(`${field}:${reason}`);
        this.name = 'InvalidPackageRegistrationError';
    }
}
