import { BaseAssignmentValidationHandler } from '../validation.handler';
import type {
    AssignmentValidationContext,
    AssignmentValidationResult,
} from '../validation.types';

export class PackageEligibilityValidationHandler extends BaseAssignmentValidationHandler {
    override handle(
        context: AssignmentValidationContext,
    ): AssignmentValidationResult {
        if (context.package.state && context.package.state !== 'CLASSIFIED') {
            return this.reject(
                'PACKAGE_NOT_ELIGIBLE',
                `Package must be in CLASSIFIED state for planning assignment, received ${context.package.state}`,
            );
        }

        return super.handle(context);
    }
}