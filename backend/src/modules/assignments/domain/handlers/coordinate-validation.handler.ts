import { BaseAssignmentValidationHandler } from '../validation.handler';
import type {
    AssignmentValidationContext,
    AssignmentValidationResult,
} from '../validation.types';

export class CoordinateValidationHandler extends BaseAssignmentValidationHandler {
    override handle(
        context: AssignmentValidationContext,
    ): AssignmentValidationResult {
        const geocoding = context.geocoding;
        if (
            !geocoding ||
            geocoding.status !== 'MATCHED' ||
            !geocoding.selectedCandidateId?.trim() ||
            !context.package.addressId.trim() ||
            geocoding.addressId !== context.package.addressId ||
            !context.planning.datasetId.trim() ||
            geocoding.datasetId !== context.planning.datasetId ||
            geocoding.datasetStatus !== 'READY'
        ) {
            return this.reject(
                'GEOCODING_NOT_READY',
                'A matched candidate for the package address and ready planning dataset is required',
            );
        }
        const { latitude, longitude } = geocoding;

        const hasValidCoordinates =
            latitude !== null &&
            longitude !== null &&
            Number.isFinite(latitude) &&
            Number.isFinite(longitude) &&
            latitude >= -90 &&
            latitude <= 90 &&
            longitude >= -180 &&
            longitude <= 180;

        if (!hasValidCoordinates) {
            return this.reject(
                'INVALID_COORDINATES',
                'Package coordinates must contain a valid latitude and longitude',
            );
        }

        return super.handle(context);
    }
}
