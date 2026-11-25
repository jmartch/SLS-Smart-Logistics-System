import {
    IsIn,
    IsNotEmpty,
    IsString,
    IsUUID,
    Matches,
    ValidateIf,
} from 'class-validator';
import type { ReviewGeocodingDecision } from '../../domain/package-geocoding.types';

export class ReviewPackageGeocodingDto {
    @IsUUID()
    readonly expectedAddressId!: string;

    @IsUUID()
    readonly expectedAttemptId!: string;

    @IsUUID()
    readonly candidateId!: string;

    @IsIn(['APPROVED', 'REJECTED'])
    readonly decision!: ReviewGeocodingDecision;

    @IsString()
    @IsNotEmpty()
    readonly reason!: string;

    @ValidateIf((_, value) => value !== undefined)
    @IsString()
    @IsNotEmpty()
    @Matches(/\S/, { message: 'operationId must not be blank' })
    readonly operationId?: string;
}
