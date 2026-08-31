import type { AssignmentValidationContext } from '../../core/assignment-validation.types';
import { ZoneValidationHandler } from '../../handlers/zone-validation.handler';
import { createContext } from '../assignment-validation.fixture';

function contextWithZone(
  zoneId: string | null,
  supportedZoneIds: readonly string[],
): AssignmentValidationContext {
  const context = createContext();

  return {
    ...context,
    package: {
      ...context.package,
      zoneId,
    },
    vehicle: {
      ...context.vehicle!,
      supportedZoneIds,
    },
  };
}

describe('ZoneValidationHandler', () => {
  const handler = new ZoneValidationHandler();

  it('accepts a zone supported by the vehicle', () => {
    const context = contextWithZone('zone-north', ['zone-north']);

    expect(handler.handle(context)).toEqual({ ok: true });
  });

  it('rejects a package without a zone', () => {
    const context = contextWithZone(null, ['zone-north']);

    expect(handler.handle(context)).toMatchObject({
      ok: false,
      code: 'ZONE_NOT_SUPPORTED',
      handler: 'ZoneValidationHandler',
    });
  });

  it('rejects a zone not supported by the vehicle', () => {
    const context = contextWithZone('zone-south', ['zone-north']);

    expect(handler.handle(context)).toMatchObject({
      ok: false,
      code: 'ZONE_NOT_SUPPORTED',
      handler: 'ZoneValidationHandler',
    });
  });
});
