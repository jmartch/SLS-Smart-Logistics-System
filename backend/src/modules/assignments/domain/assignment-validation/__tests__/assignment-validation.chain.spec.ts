import {
  buildAssignmentValidationChain,
  createAssignmentValidationChain,
} from '../chain/assignment-validation.chain';
import { BaseAssignmentValidationHandler } from '../core/assignment-validation.handler';
import type {
  AssignmentValidationContext,
  AssignmentValidationResult,
} from '../core/assignment-validation.types';
import { CoordinateValidationHandler } from '../handlers/coordinate-validation.handler';
import { TenantValidationHandler } from '../handlers/tenant-validation.handler';
import { createContext } from './assignment-validation.fixture';

class AdditionalRuleHandler extends BaseAssignmentValidationHandler {
  override handle(
    _context: AssignmentValidationContext,
  ): AssignmentValidationResult {
    return this.reject(
      'INCOMPLETE_DATA',
      'Additional validation rule rejected the assignment',
    );
  }
}

describe('AssignmentValidationChain', () => {
  it('accepts a context that passes every handler', () => {
    const chain = createAssignmentValidationChain();

    expect(chain.handle(createContext())).toEqual({ ok: true });
  });

  it('stops at tenant validation before checking coordinates', () => {
    const originalContext = createContext();

    const context: AssignmentValidationContext = {
      ...originalContext,
      package: {
        ...originalContext.package,
        tenantId: 'tenant-b',
        latitude: 200,
      },
    };

    const chain = createAssignmentValidationChain();
    const result = chain.handle(context);

    expect(result).toMatchObject({
      ok: false,
      code: 'TENANT_MISMATCH',
      handler: 'TenantValidationHandler',
    });
  });

  it('reaches coordinate validation when tenant validation passes', () => {
    const originalContext = createContext();

    const context: AssignmentValidationContext = {
      ...originalContext,
      package: {
        ...originalContext.package,
        latitude: 200,
      },
    };

    const chain = createAssignmentValidationChain();
    const result = chain.handle(context);

    expect(result).toMatchObject({
      ok: false,
      code: 'INVALID_COORDINATES',
      handler: 'CoordinateValidationHandler',
    });
  });

  it('checks complete data before coordinates', () => {
    const originalContext = createContext();

    const context: AssignmentValidationContext = {
      ...originalContext,
      package: {
        ...originalContext.package,
        recipientAddress: ' ',
        latitude: 200,
      },
    };

    const result = createAssignmentValidationChain().handle(context);

    expect(result).toMatchObject({
      ok: false,
      code: 'INCOMPLETE_DATA',
      handler: 'CompleteDataValidationHandler',
    });
  });

  it('checks weight before volume when both capacities are exceeded', () => {
    const originalContext = createContext();

    const context: AssignmentValidationContext = {
      ...originalContext,
      package: {
        ...originalContext.package,
        weightKg: 101,
        volumeM3: 6,
      },
    };

    const result = createAssignmentValidationChain().handle(context);

    expect(result).toMatchObject({
      ok: false,
      code: 'WEIGHT_CAPACITY_EXCEEDED',
      handler: 'WeightCapacityHandler',
    });
  });

  it('reaches courier validation after all previous rules pass', () => {
    const originalContext = createContext();

    const context: AssignmentValidationContext = {
      ...originalContext,
      courier: {
        ...originalContext.courier!,
        available: false,
      },
    };

    const result = createAssignmentValidationChain().handle(context);

    expect(result).toMatchObject({
      ok: false,
      code: 'COURIER_UNAVAILABLE',
      handler: 'CourierAvailabilityHandler',
    });
  });

  it('allows a new handler without modifying existing handlers', () => {
    const chain = buildAssignmentValidationChain([
      new TenantValidationHandler(),
      new CoordinateValidationHandler(),
      new AdditionalRuleHandler(),
    ]);

    const result = chain.handle(createContext());

    expect(result).toEqual({
      ok: false,
      code: 'INCOMPLETE_DATA',
      message: 'Additional validation rule rejected the assignment',
      handler: 'AdditionalRuleHandler',
    });
  });

  it('rejects an empty handler collection', () => {
    expect(() => buildAssignmentValidationChain([])).toThrow(
      'Assignment validation chain requires at least one handler',
    );
  });
});
