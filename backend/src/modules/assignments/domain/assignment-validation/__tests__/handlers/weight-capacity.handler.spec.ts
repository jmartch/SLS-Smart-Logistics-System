import type { AssignmentValidationContext } from '../../core/assignment-validation.types';
import { WeightCapacityHandler } from '../../handlers/weight-capacity.handler';
import { createContext } from '../assignment-validation.fixture';

function contextWithWeight(
  packageWeightKg: number,
  remainingWeightKg: number,
): AssignmentValidationContext {
  const context = createContext();

  return {
    ...context,
    package: {
      ...context.package,
      weightKg: packageWeightKg,
    },
    vehicle: {
      ...context.vehicle!,
      remainingWeightKg,
    },
  };
}

describe('WeightCapacityHandler', () => {
  const handler = new WeightCapacityHandler();

  it('accepts a package below the remaining capacity', () => {
    expect(handler.handle(contextWithWeight(10, 20))).toEqual({
      ok: true,
    });
  });

  it('accepts a package equal to the remaining capacity', () => {
    expect(handler.handle(contextWithWeight(20, 20))).toEqual({
      ok: true,
    });
  });

  it('rejects a package above the remaining capacity', () => {
    expect(handler.handle(contextWithWeight(21, 20))).toMatchObject({
      ok: false,
      code: 'WEIGHT_CAPACITY_EXCEEDED',
      handler: 'WeightCapacityHandler',
    });
  });
});
