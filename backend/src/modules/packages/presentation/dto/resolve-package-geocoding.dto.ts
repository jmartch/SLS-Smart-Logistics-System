import {
    IsBoolean,
    IsNotEmpty,
    IsString,
    IsUUID,
    Matches,
    ValidateIf,
} from 'class-validator';

export class ResolvePackageGeocodingDto {
    @ValidateIf((_, value) => value !== undefined && value !== null)
    @IsUUID()
    readonly expectedAttemptId?: string | null;

    @ValidateIf((_, value) => value !== undefined)
    @IsBoolean()
    readonly forceRetry?: boolean;

    @ValidateIf((_, value) => value !== undefined)
    @IsString()
    @IsNotEmpty()
    @Matches(/\S/, { message: 'operationId must not be blank' })
    readonly operationId?: string;
}
