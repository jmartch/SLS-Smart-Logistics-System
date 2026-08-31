import type { AssignmentValidationContext } from '../../core/assignment-validation.types';
import { CoordinateValidationHandler } from '../../handlers/coordinate-validation.handler';
import { createContext } from '../assignment-validation.fixture';

function contextWithCoordinates(
  latitude: number | null,
  longitude: number | null,
): AssignmentValidationContext {
  const context = createContext();

  return {
    ...context,
    package: {
      ...context.package,
      latitude,
      longitude,
    },
  };
}

describe('CoordinateValidationHandler', () => {
  const handler = new CoordinateValidationHandler();

  it('accepts valid coordinates', () => {
    const context = contextWithCoordinates(11.0041, -74.807);

    expect(handler.handle(context)).toEqual({ ok: true });
  });

  it('rejects missing coordinates', () => {
    const context = contextWithCoordinates(null, null);

    expect(handler.handle(context)).toEqual({
      ok: false,
      code: 'INVALID_COORDINATES',
      message:
        'Package coordinates must contain a valid latitude and longitude',
      handler: 'CoordinateValidationHandler',
    });
  });

  it.each([
    [91, -74.807],
    [-91, -74.807],
    [11.0041, 181],
    [11.0041, -181],
    [Number.NaN, -74.807],
    [11.0041, Number.POSITIVE_INFINITY],
  ])(
    'rejects invalid coordinates latitude=%s longitude=%s',
    (latitude, longitude) => {
      const context = contextWithCoordinates(latitude, longitude);

      const result = handler.handle(context);

      expect(result.ok).toBe(false);

      if (!result.ok) {
        expect(result.code).toBe('INVALID_COORDINATES');
        expect(result.handler).toBe('CoordinateValidationHandler');
      }
    },
  );
});
