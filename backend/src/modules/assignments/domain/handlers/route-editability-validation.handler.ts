import { BaseAssignmentValidationHandler } from '../validation.handler';
import type {
    AssignmentValidationContext,
    AssignmentValidationResult,
} from '../validation.types';

export class RouteEditabilityValidationHandler extends BaseAssignmentValidationHandler {
    override handle(
        context: AssignmentValidationContext,
    ): AssignmentValidationResult {
        if (
            context.route?.status &&
            context.route.status !== 'PLANNED'
        ) {
            return this.reject(
                'ROUTE_NOT_EDITABLE',
                `Target route '${context.route.id ?? 'unknown'}' is in status '${context.route.status}'. Manifest modifications are only permitted when route is PLANNED`,
            );
        }

        if (
            context.sourceRoute?.status &&
            context.sourceRoute.status !== 'PLANNED'
        ) {
            return this.reject(
                'ROUTE_NOT_EDITABLE',
                `Source route '${context.sourceRoute.id ?? 'unknown'}' is in status '${context.sourceRoute.status}'. Packages cannot be extracted from a non-PLANNED route`,
            );
        }

        return super.handle(context);
    }
}
