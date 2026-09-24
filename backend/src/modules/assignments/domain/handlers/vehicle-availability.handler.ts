import { BaseAssignmentValidationHandler } from '../validation.handler';
import type {
    AssignmentValidationContext,
    AssignmentValidationResult,
} from '../validation.types';

export class VehicleAvailabilityHandler extends BaseAssignmentValidationHandler {
    override handle(
        context: AssignmentValidationContext,
    ): AssignmentValidationResult {
        if (context.vehicle === null || !context.vehicle.available) {
            return this.reject(
                'VEHICLE_UNAVAILABLE',
                'A currently available vehicle is required',
            );
        }

        return super.handle(context);
    }
}
