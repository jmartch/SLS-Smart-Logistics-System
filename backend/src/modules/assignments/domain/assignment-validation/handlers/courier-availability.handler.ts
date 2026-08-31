import { BaseAssignmentValidationHandler } from '../core/assignment-validation.handler';
import type {
  AssignmentValidationContext,
  AssignmentValidationResult,
} from '../core/assignment-validation.types';

export class CourierAvailabilityHandler extends BaseAssignmentValidationHandler {
  override handle(
    context: AssignmentValidationContext,
  ): AssignmentValidationResult {
    if (context.courier === null || !context.courier.available) {
      return this.reject(
        'COURIER_UNAVAILABLE',
        'A currently available courier is required',
      );
    }

    return super.handle(context);
  }
}
