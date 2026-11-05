import { BaseAssignmentValidationHandler } from '../validation.handler';
import type {
    AssignmentValidationContext,
    AssignmentValidationResult,
} from '../validation.types';

export class PackageEligibilityValidationHandler extends BaseAssignmentValidationHandler {
    constructor(
        private readonly allowedStates: readonly string[] = ['CLASSIFIED'],
    ) {
        super();
    }

    override handle(
        context: AssignmentValidationContext,
    ): AssignmentValidationResult {
        if (
            context.package.state &&
            !this.allowedStates.includes(context.package.state)
        ) {
            return this.reject(
                'PACKAGE_NOT_ELIGIBLE',
                `Package must be in ${this.allowedStates.join(' or ')} state for planning assignment, received ${context.package.state}`,
            );
        }

        return super.handle(context);
    }
}