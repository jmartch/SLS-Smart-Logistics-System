import { BaseAssignmentValidationHandler } from '../validation.handler';
import type {
    AssignmentValidationContext,
    AssignmentValidationResult,
} from '../validation.types';

export class CompleteDataValidationHandler extends BaseAssignmentValidationHandler {
    override handle(
        context: AssignmentValidationContext,
    ): AssignmentValidationResult {
        const packageData = context.package;

        const hasMissingText =
            context.tenantId.trim().length === 0 ||
            packageData.id.trim().length === 0 ||
            packageData.tenantId.trim().length === 0 ||
            packageData.recipientAddress.trim().length === 0;

        const hasInvalidMeasurements =
            !Number.isSafeInteger(packageData.weightGrams) ||
            packageData.weightGrams <= 0 ||
            !Number.isSafeInteger(packageData.volumeCm3) ||
            packageData.volumeCm3 <= 0;

        if (hasMissingText || hasInvalidMeasurements) {
            return this.reject(
                'INCOMPLETE_DATA',
                'Package must include identifiers, recipient address, positive weight and volume',
            );
        }

        return super.handle(context);
    }
}
