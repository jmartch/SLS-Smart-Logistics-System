import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CorrectPackageAddressDto {
    @IsUUID()
    readonly expectedAddressId!: string;

    @IsString()
    @IsNotEmpty()
    readonly newOriginalText!: string;

    @IsString()
    @IsNotEmpty()
    readonly newMunicipalityCode!: string;

    @IsString()
    @IsNotEmpty()
    readonly reason!: string;

    @IsOptional()
    @IsUUID()
    readonly expectedAttemptId?: string | null;
}
