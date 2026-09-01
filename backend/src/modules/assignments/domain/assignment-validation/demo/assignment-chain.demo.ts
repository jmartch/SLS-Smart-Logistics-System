import { createAssignmentValidationChain } from '../chain/assignment-validation.chain';
import type { AssignmentValidationContext } from '../core/assignment-validation.types';

function createValidContext(): AssignmentValidationContext {
  return {
    tenantId: 'tenant-a',
    hasActiveAssignment: false,
    package: {
      id: 'PKG-001',
      tenantId: 'tenant-a',
      recipientAddress: 'Calle 84 # 50-20',
      latitude: 11.0041,
      longitude: -74.807,
      zoneId: 'zone-north',
      weightKg: 10,
      volumeM3: 0.2,
    },
    vehicle: {
      id: 'VEH-001',
      tenantId: 'tenant-a',
      available: true,
      remainingWeightKg: 100,
      remainingVolumeM3: 5,
      supportedZoneIds: ['zone-north'],
    },
    courier: {
      id: 'COU-001',
      tenantId: 'tenant-a',
      available: true,
    },
  };
}

function contextWithPackage(
  changes: Partial<AssignmentValidationContext['package']>,
): AssignmentValidationContext {
  const context = createValidContext();
  return { ...context, package: { ...context.package, ...changes } };
}

function showResult(
  scenario: string,
  context: AssignmentValidationContext,
): void {
  const result = createAssignmentValidationChain().handle(context);

  console.log(`\n=== ${scenario} ===`);

  if (result.ok) {
    console.log('APPROVED: every handler delegated to the next one');
    return;
  }

  console.log(`REJECTED by ${result.handler}`);
  console.log({ code: result.code, message: result.message });
}

showResult('Valid assignment', createValidContext());

showResult('Duplicate assignment', {
  ...createValidContext(),
  hasActiveAssignment: true,
});

showResult('Invalid coordinates', contextWithPackage({ latitude: 200 }));

showResult(
  'Insufficient weight capacity',
  contextWithPackage({ weightKg: 101 }),
);

const unavailableCourierContext = createValidContext();

showResult('Unavailable courier', {
  ...unavailableCourierContext,
  courier: { ...unavailableCourierContext.courier!, available: false },
});
