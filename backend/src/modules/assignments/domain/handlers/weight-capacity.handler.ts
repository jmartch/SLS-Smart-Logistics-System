import { BaseAssignmentValidationHandler } from '../validation.handler';
import type {
    AssignmentValidationContext,
    AssignmentValidationResult,
} from '../validation.types';

export class WeightCapacityHandler extends BaseAssignmentValidationHandler {
    override handle(
        context: AssignmentValidationContext,
    ): AssignmentValidationResult {
        const { vehicle } = context;

        if (
            vehicle !== null &&
            context.package.weightGrams > vehicle.remainingWeightGrams
        ) {
            return this.reject(
                'WEIGHT_CAPACITY_EXCEEDED',
                'Package weight exceeds the remaining vehicle capacity',
            );
        }

        return super.handle(context);
    }
}