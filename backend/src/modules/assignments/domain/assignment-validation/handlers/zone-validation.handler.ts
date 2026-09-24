import { BaseAssignmentValidationHandler } from '../core/assignment-validation.handler';
import type {
  AssignmentValidationContext,
  AssignmentValidationResult,
} from '../core/assignment-validation.types';

export class ZoneValidationHandler extends BaseAssignmentValidationHandler {
  override handle(
    context: AssignmentValidationContext,
  ): AssignmentValidationResult {
    const { zoneId } = context.package;
    const { vehicle } = context;

    const isUnsupported =
      zoneId === null ||
      (vehicle !== null && !vehicle.supportedZoneIds.includes(zoneId));

    if (isUnsupported) {
      return this.reject(
        'ZONE_NOT_SUPPORTED',
        'Package zone must be supported by the selected vehicle',
      );
    }

    return super.handle(context);
  }
}
