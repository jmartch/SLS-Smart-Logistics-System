import type { AssignmentValidationContext } from '../../core/assignment-validation.types';
import { CourierAvailabilityHandler } from '../../handlers/courier-availability.handler';
import { createContext } from '../assignment-validation.fixture';

describe('CourierAvailabilityHandler', () => {
  const handler = new CourierAvailabilityHandler();

  it('accepts an available courier', () => {
    expect(handler.handle(createContext())).toEqual({ ok: true });
  });

  it('rejects when no courier was selected', () => {
    const context: AssignmentValidationContext = {
      ...createContext(),
      courier: null,
    };

    expect(handler.handle(context)).toMatchObject({
      ok: false,
      code: 'COURIER_UNAVAILABLE',
      handler: 'CourierAvailabilityHandler',
    });
  });

  it('rejects an unavailable courier', () => {
    const originalContext = createContext();

    const context: AssignmentValidationContext = {
      ...originalContext,
      courier: {
        ...originalContext.courier!,
        available: false,
      },
    };

    expect(handler.handle(context)).toMatchObject({
      ok: false,
      code: 'COURIER_UNAVAILABLE',
      handler: 'CourierAvailabilityHandler',
    });
  });
});
