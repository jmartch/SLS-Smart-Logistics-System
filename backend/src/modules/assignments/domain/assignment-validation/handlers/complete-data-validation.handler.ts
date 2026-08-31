import { BaseAssignmentValidationHandler } from '../core/assignment-validation.handler';
import type {
  AssignmentValidationContext,
  AssignmentValidationResult,
} from '../core/assignment-validation.types';

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
      !Number.isFinite(packageData.weightKg) ||
      packageData.weightKg <= 0 ||
      !Number.isFinite(packageData.volumeM3) ||
      packageData.volumeM3 <= 0;

    if (hasMissingText || hasInvalidMeasurements) {
      return this.reject(
        'INCOMPLETE_DATA',
        'Package must include identifiers, recipient address, positive weight and volume',
      );
    }

    return super.handle(context);
  }
}
