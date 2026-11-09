import { IsOptional, IsUUID } from 'class-validator';

export class ClassifyPackageDto {
    @IsUUID()
    readonly zoneId!: string;

    @IsOptional()
    @IsUUID()
    readonly sectorId?: string;
}
