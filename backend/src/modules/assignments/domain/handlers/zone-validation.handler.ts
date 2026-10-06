import { BaseAssignmentValidationHandler } from '../validation.handler';
import type {
    AssignmentValidationContext,
    AssignmentValidationResult,
} from '../validation.types';

export class ZoneValidationHandler extends BaseAssignmentValidationHandler {
    override handle(
        context: AssignmentValidationContext,
    ): AssignmentValidationResult {
        const { zoneId } = context.package;
        const requestedZoneId = context.planning.zoneId;

        if (zoneId === null || zoneId.trim().length === 0) {
            return this.reject(
                'ZONE_NOT_SUPPORTED',
                'Package must be classified in a zone before assignment',
            );
        }

        if (requestedZoneId && zoneId !== requestedZoneId) {
            return this.reject(
                'ZONE_NOT_SUPPORTED',
                `Package zone ${zoneId} does not match requested planning zone ${requestedZoneId}`,
            );
        }

        return super.handle(context);
    }
}