export interface RegisterPackageDto {
    readonly trackingCode: string;
    readonly address: {
        readonly text: string;
        readonly municipalityCode: string;
    };
    readonly shipmentTypeId: string;
    readonly zoneId?: string;
    readonly sectorId?: string;
    readonly weightKg: number | string;
    readonly lengthCm: number | string;
    readonly widthCm: number | string;
    readonly heightCm: number | string;
    readonly priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
    readonly deadline?: string;
    readonly serviceDurationSeconds?: number;
}
