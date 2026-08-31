import type { AssignmentValidationContext } from '../../core/assignment-validation.types';
import { VolumeCapacityHandler } from '../../handlers/volume-capacity.handler';
import { createContext } from '../assignment-validation.fixture';

function contextWithVolume(
  packageVolumeM3: number,
  remainingVolumeM3: number,
): AssignmentValidationContext {
  const context = createContext();

  return {
    ...context,
    package: {
      ...context.package,
      volumeM3: packageVolumeM3,
    },
    vehicle: {
      ...context.vehicle!,
      remainingVolumeM3,
    },
  };
}

describe('VolumeCapacityHandler', () => {
  const handler = new VolumeCapacityHandler();

  it('accepts a package below the remaining capacity', () => {
    expect(handler.handle(contextWithVolume(0.2, 1))).toEqual({
      ok: true,
    });
  });

  it('accepts a package equal to the remaining capacity', () => {
    expect(handler.handle(contextWithVolume(1, 1))).toEqual({
      ok: true,
    });
  });

  it('rejects a package above the remaining capacity', () => {
    expect(handler.handle(contextWithVolume(1.1, 1))).toMatchObject({
      ok: false,
      code: 'VOLUME_CAPACITY_EXCEEDED',
      handler: 'VolumeCapacityHandler',
    });
  });
});
