import type { AssignmentValidationContext } from '../../core/assignment-validation.types';
import { VehicleAvailabilityHandler } from '../../handlers/vehicle-availability.handler';
import { createContext } from '../assignment-validation.fixture';

describe('VehicleAvailabilityHandler', () => {
  const handler = new VehicleAvailabilityHandler();

  it('accepts an available vehicle', () => {
    expect(handler.handle(createContext())).toEqual({ ok: true });
  });

  it('rejects when no vehicle was selected', () => {
    const context: AssignmentValidationContext = {
      ...createContext(),
      vehicle: null,
    };

    expect(handler.handle(context)).toMatchObject({
      ok: false,
      code: 'VEHICLE_UNAVAILABLE',
      handler: 'VehicleAvailabilityHandler',
    });
  });

  it('rejects an unavailable vehicle', () => {
    const originalContext = createContext();

    const context: AssignmentValidationContext = {
      ...originalContext,
      vehicle: {
        ...originalContext.vehicle!,
        available: false,
      },
    };

    expect(handler.handle(context)).toMatchObject({
      ok: false,
      code: 'VEHICLE_UNAVAILABLE',
      handler: 'VehicleAvailabilityHandler',
    });
  });
});
