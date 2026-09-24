import { BaseAssignmentValidationHandler } from '../core/assignment-validation.handler';
import type {
  AssignmentValidationContext,
  AssignmentValidationResult,
} from '../core/assignment-validation.types';

export class CoordinateValidationHandler extends BaseAssignmentValidationHandler {
  override handle(
    context: AssignmentValidationContext,
  ): AssignmentValidationResult {
    const { latitude, longitude } = context.package;

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
