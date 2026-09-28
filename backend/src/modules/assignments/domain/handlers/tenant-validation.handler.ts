import { BaseAssignmentValidationHandler } from '../validation.handler';
import type {
    AssignmentValidationContext,
    AssignmentValidationResult,
} from '../validation.types';

export class TenantValidationHandler extends BaseAssignmentValidationHandler {
    override handle(
        context: AssignmentValidationContext,
    ): AssignmentValidationResult {
        const hasTenantMismatch =
            context.package.tenantId !== context.tenantId ||
            (context.geocoding !== null &&
                context.geocoding.tenantId !== context.tenantId) ||
            (context.networkAttachment !== null &&
                context.networkAttachment.tenantId !== context.tenantId) ||
            (context.vehicle !== null &&
                context.vehicle.tenantId !== context.tenantId) ||
            (context.courier !== null &&
                context.courier.tenantId !== context.tenantId);

        if (hasTenantMismatch) {
            return this.reject(
                'TENANT_MISMATCH',
                'All assignment resources must belong to the current tenant',
            );
        }

        return super.handle(context);
    }
}
