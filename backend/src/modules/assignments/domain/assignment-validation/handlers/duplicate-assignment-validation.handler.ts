import { BaseAssignmentValidationHandler } from '../core/assignment-validation.handler';
import type {
  AssignmentValidationContext,
  AssignmentValidationResult,
} from '../core/assignment-validation.types';

export class DuplicateAssignmentValidationHandler extends BaseAssignmentValidationHandler {
  override handle(
    context: AssignmentValidationContext,
  ): AssignmentValidationResult {
    if (context.hasActiveAssignment) {
      return this.reject(
        'DUPLICATE_ASSIGNMENT',
        'Package already has an active route assignment',
      );
    }

    return super.handle(context);
  }
}
