import {
  buildAssignmentValidationChain,
  createAssignmentValidationChain,
} from '../chain/assignment-validation.chain';
import { BaseAssignmentValidationHandler } from '../core/assignment-validation.handler';
import type {
  AssignmentRejectionCode,
  AssignmentValidationContext,
  AssignmentValidationResult,
} from '../core/assignment-validation.types';
import { CoordinateValidationHandler } from '../handlers/coordinate-validation.handler';
import { TenantValidationHandler } from '../handlers/tenant-validation.handler';
import { createContext } from './assignment-validation.fixture';

interface RejectionScenario {
  readonly name: string;
  readonly context: () => AssignmentValidationContext;
  readonly code: AssignmentRejectionCode;
  readonly handler: string;
}

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

function packageContext(
  changes: Partial<AssignmentValidationContext['package']>,
): AssignmentValidationContext {
  const context = createContext();

  return {
    ...context,
    package: { ...context.package, ...changes },
  };
}

describe('AssignmentValidationChain', () => {
  it('accepts an assignment that passes the complete chain', () => {
    expect(createAssignmentValidationChain().handle(createContext())).toEqual({
      ok: true,
    });
  });

  it('returns the expected rejection for every validation stage', () => {
    const scenarios: RejectionScenario[] = [
      {
        name: 'tenant mismatch',
        context: () => packageContext({ tenantId: 'tenant-b' }),
        code: 'TENANT_MISMATCH',
        handler: 'TenantValidationHandler',
      },
      {
        name: 'duplicate assignment',
        context: () => ({ ...createContext(), hasActiveAssignment: true }),
        code: 'DUPLICATE_ASSIGNMENT',
        handler: 'DuplicateAssignmentValidationHandler',
      },
      {
        name: 'incomplete package data',
        context: () => packageContext({ recipientAddress: ' ' }),
        code: 'INCOMPLETE_DATA',
        handler: 'CompleteDataValidationHandler',
      },
      {
        name: 'invalid coordinates',
        context: () => packageContext({ latitude: 200 }),
        code: 'INVALID_COORDINATES',
        handler: 'CoordinateValidationHandler',
      },
      {
        name: 'unsupported zone',
        context: () => packageContext({ zoneId: 'zone-south' }),
        code: 'ZONE_NOT_SUPPORTED',
        handler: 'ZoneValidationHandler',
      },
      {
        name: 'unavailable vehicle',
        context: () => {
          const context = createContext();
          return {
            ...context,
            vehicle: { ...context.vehicle!, available: false },
          };
        },
        code: 'VEHICLE_UNAVAILABLE',
        handler: 'VehicleAvailabilityHandler',
      },
      {
        name: 'insufficient weight capacity',
        context: () => packageContext({ weightKg: 101 }),
        code: 'WEIGHT_CAPACITY_EXCEEDED',
        handler: 'WeightCapacityHandler',
      },
      {
        name: 'insufficient volume capacity',
        context: () => packageContext({ volumeM3: 6 }),
        code: 'VOLUME_CAPACITY_EXCEEDED',
        handler: 'VolumeCapacityHandler',
      },
      {
        name: 'unavailable courier',
        context: () => {
          const context = createContext();
          return {
            ...context,
            courier: { ...context.courier!, available: false },
          };
        },
        code: 'COURIER_UNAVAILABLE',
        handler: 'CourierAvailabilityHandler',
      },
    ];

    const chain = createAssignmentValidationChain();

    for (const scenario of scenarios) {
      expect({
        scenario: scenario.name,
        result: chain.handle(scenario.context()),
      }).toMatchObject({
        scenario: scenario.name,
        result: {
          ok: false,
          code: scenario.code,
          handler: scenario.handler,
        },
      });
    }
  });

  it('stops at the first failing handler', () => {
    const context = packageContext({ weightKg: 101, volumeM3: 6 });

    expect(createAssignmentValidationChain().handle(context)).toMatchObject({
      ok: false,
      code: 'WEIGHT_CAPACITY_EXCEEDED',
      handler: 'WeightCapacityHandler',
    });
  });

  it('supports extension and rejects an empty chain', () => {
    const extendedChain = buildAssignmentValidationChain([
      new TenantValidationHandler(),
      new CoordinateValidationHandler(),
      new AdditionalRuleHandler(),
    ]);

    expect(extendedChain.handle(createContext())).toMatchObject({
      ok: false,
      handler: 'AdditionalRuleHandler',
    });

    expect(() => buildAssignmentValidationChain([])).toThrow(
      'Assignment validation chain requires at least one handler',
    );
  });
});
