import { BaseAssignmentValidationHandler } from '../validation.handler';
import type {
    AssignmentValidationContext,
    AssignmentValidationResult,
} from '../validation.types';

export class DuplicateAssignmentValidationHandler extends BaseAssignmentValidationHandler {
    override handle(
        context: AssignmentValidationContext,
    ): AssignmentValidationResult {
        if (context.hasDuplicateAssignment) {
            return this.reject(
                'DUPLICATE_ASSIGNMENT',
                'Package already has an active assignment to this route',
            );
        }

        return super.handle(context);
    }
}
