import type { AssignmentValidationHandler } from '../core/assignment-validation.handler';
import { CompleteDataValidationHandler } from '../handlers/complete-data-validation.handler';
import { CoordinateValidationHandler } from '../handlers/coordinate-validation.handler';
import { CourierAvailabilityHandler } from '../handlers/courier-availability.handler';
import { DuplicateAssignmentValidationHandler } from '../handlers/duplicate-assignment-validation.handler';
import { TenantValidationHandler } from '../handlers/tenant-validation.handler';
import { VehicleAvailabilityHandler } from '../handlers/vehicle-availability.handler';
import { VolumeCapacityHandler } from '../handlers/volume-capacity.handler';
import { WeightCapacityHandler } from '../handlers/weight-capacity.handler';
import { ZoneValidationHandler } from '../handlers/zone-validation.handler';

export function buildAssignmentValidationChain(
  handlers: readonly AssignmentValidationHandler[],
): AssignmentValidationHandler {
  const [firstHandler, ...remainingHandlers] = handlers;

  if (!firstHandler) {
    throw new Error(
      'Assignment validation chain requires at least one handler',
    );
  }

  let currentHandler = firstHandler;

  for (const nextHandler of remainingHandlers) {
    currentHandler = currentHandler.setNext(nextHandler);
  }

  return firstHandler;
}

export function createAssignmentValidationChain(): AssignmentValidationHandler {
  return buildAssignmentValidationChain([
    new TenantValidationHandler(),
    new DuplicateAssignmentValidationHandler(),
    new CompleteDataValidationHandler(),
    new CoordinateValidationHandler(),
    new ZoneValidationHandler(),
    new VehicleAvailabilityHandler(),
    new WeightCapacityHandler(),
    new VolumeCapacityHandler(),
    new CourierAvailabilityHandler(),
  ]);
}
