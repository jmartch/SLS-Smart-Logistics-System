import { BaseAssignmentValidationHandler } from '../core/assignment-validation.handler';
import type {
  AssignmentValidationContext,
  AssignmentValidationResult,
} from '../core/assignment-validation.types';

export class TenantValidationHandler extends BaseAssignmentValidationHandler {
  override handle(
    context: AssignmentValidationContext,
  ): AssignmentValidationResult {
    const hasTenantMismatch =
      context.package.tenantId !== context.tenantId ||
      (context.vehicle !== null &&
        context.vehicle.tenantId !== context.tenantId) ||
      (context.courier !== null &&
        context.courier.tenantId !== context.tenantId);

    if (hasTenantMismatch) {
      return this.reject(
        'TENANT_MISMATCH',
        'Package, vehicle and courier must belong to the current tenant',
      );
    }

    return super.handle(context);
  }
}
