import { createAssignmentValidationChain } from '../../src/modules/assignments/domain/validation.chain';
import type { AssignmentValidationContext } from '../../src/modules/assignments/domain/validation.types';

function createValidContext(): AssignmentValidationContext {
    return {
        tenantId: 'tenant-a',
        hasDuplicateAssignment: false,
        planning: { datasetId: 'dataset-1', profile: 'MOTOR_VEHICLE' },
        geocoding: {
            tenantId: 'tenant-a',
            addressId: 'address-1',
            datasetId: 'dataset-1',
            datasetStatus: 'READY',
            status: 'MATCHED',
            selectedCandidateId: 'candidate-1',
            latitude: 11.0041,
            longitude: -74.807,
        },
        networkAttachment: {
            tenantId: 'tenant-a',
            datasetId: 'dataset-1',
            geocodingCandidateId: 'candidate-1',
            profile: 'MOTOR_VEHICLE',
            status: 'AUTO_ACCEPTED',
            roadNodeId: 'node-1',
            roadEdgeId: null,
        },
        package: {
            id: 'PKG-001',
            tenantId: 'tenant-a',
            recipientAddress: 'Calle 84 # 50-20',
            zoneId: 'zone-north',
            addressId: 'address-1',
            weightKg: 10,
            volumeM3: 0.2,
        },
        vehicle: {
            id: 'VEH-001',
            tenantId: 'tenant-a',
            available: true,
            remainingWeightKg: 100,
            remainingVolumeM3: 5,
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
    hasDuplicateAssignment: true,
});

showResult('Invalid coordinates', {
    ...createValidContext(),
    geocoding: { ...createValidContext().geocoding!, latitude: 200 },
});
showResult('Geocoding requires review', {
    ...createValidContext(),
    geocoding: {
        ...createValidContext().geocoding!,
        status: 'REVIEW_REQUIRED',
    },
});
showResult('Missing road attachment', {
    ...createValidContext(),
    networkAttachment: null,
});

showResult(
    'Insufficient weight capacity',
    contextWithPackage({ weightKg: 101 }),
);

const unavailableCourierContext = createValidContext();

showResult('Unavailable courier', {
    ...unavailableCourierContext,
    courier: { ...unavailableCourierContext.courier!, available: false },
});
