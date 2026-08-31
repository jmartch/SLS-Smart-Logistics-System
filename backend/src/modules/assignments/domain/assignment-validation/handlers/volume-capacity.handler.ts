import { BaseAssignmentValidationHandler } from '../core/assignment-validation.handler';
import type {
  AssignmentValidationContext,
  AssignmentValidationResult,
} from '../core/assignment-validation.types';

export class VolumeCapacityHandler extends BaseAssignmentValidationHandler {
  override handle(
    context: AssignmentValidationContext,
  ): AssignmentValidationResult {
    const { vehicle } = context;

    if (
      vehicle !== null &&
      context.package.volumeM3 > vehicle.remainingVolumeM3
    ) {
      return this.reject(
        'VOLUME_CAPACITY_EXCEEDED',
        'Package volume exceeds the remaining vehicle capacity',
      );
    }

    return super.handle(context);
  }
}
