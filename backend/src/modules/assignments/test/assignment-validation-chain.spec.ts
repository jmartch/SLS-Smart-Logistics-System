import {
    buildAssignmentValidationChain,
    createAssignmentValidationChain,
} from '../domain/validation.chain';
import { BaseAssignmentValidationHandler } from '../domain/validation.handler';
import type {
    AssignmentRejectionCode,
    AssignmentValidationContext,
    AssignmentValidationResult,
} from '../domain/validation.types';
import { CoordinateValidationHandler } from '../domain/handlers/coordinate-validation.handler';
import { TenantValidationHandler } from '../domain/handlers/tenant-validation.handler';

function createContext(): AssignmentValidationContext {
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
            id: 'package-1',
            tenantId: 'tenant-a',
            recipientAddress: 'Calle 84 # 50-20',
            zoneId: 'zone-north',
            addressId: 'address-1',
            weightKg: 10,
            volumeM3: 0.2,
        },
        vehicle: {
            id: 'vehicle-1',
            tenantId: 'tenant-a',
            available: true,
            remainingWeightKg: 100,
            remainingVolumeM3: 5,
        },
        courier: {
            id: 'courier-1',
            tenantId: 'tenant-a',
            available: true,
        },
    };
}

interface RejectionScenario {
    readonly name: string;
    readonly context: () => AssignmentValidationContext;
    readonly code: AssignmentRejectionCode;
    readonly handler: string;
}

class AdditionalRuleHandler extends BaseAssignmentValidationHandler {
    override handle(): AssignmentValidationResult {
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
    const geocodingFailures: Partial<
        NonNullable<AssignmentValidationContext['geocoding']>
    >[] = [
        { status: 'NOT_FOUND' },
        { status: 'REVIEW_REQUIRED' },
        { selectedCandidateId: null },
        { selectedCandidateId: ' ' },
        { addressId: 'another-address' },
        { datasetId: 'another-dataset' },
        { datasetStatus: 'STAGING' },
        { datasetStatus: 'FAILED' },
    ];
    it.each(geocodingFailures)('rejects unusable geocoding: %j', (changes) => {
        const context = createContext();
        expect(
            createAssignmentValidationChain().handle({
                ...context,
                geocoding: { ...context.geocoding!, ...changes },
            }),
        ).toMatchObject({ ok: false, code: 'GEOCODING_NOT_READY' });
    });

    it('rejects missing geocoding', () => {
        expect(
            createAssignmentValidationChain().handle({
                ...createContext(),
                geocoding: null,
            }),
        ).toMatchObject({ ok: false, code: 'GEOCODING_NOT_READY' });
    });

    const coordinateFailures = [
        { latitude: null },
        { longitude: null },
        { latitude: NaN },
        { longitude: Infinity },
        { latitude: -91 },
        { longitude: 181 },
        { longitude: -181 },
    ];
    it.each(coordinateFailures)(
        'rejects invalid candidate coordinates: %j',
        (changes) => {
            const context = createContext();
            expect(
                createAssignmentValidationChain().handle({
                    ...context,
                    geocoding: { ...context.geocoding!, ...changes },
                }),
            ).toMatchObject({ ok: false, code: 'INVALID_COORDINATES' });
        },
    );

    const attachmentFailures: Partial<
        NonNullable<AssignmentValidationContext['networkAttachment']>
    >[] = [
        { status: 'REVIEW_REQUIRED' },
        { status: 'REJECTED' },
        { datasetId: 'another-dataset' },
        { profile: 'FOOT' },
        { geocodingCandidateId: 'another-candidate' },
        { roadNodeId: null },
        { roadNodeId: ' ' },
        { roadEdgeId: 'edge-1' },
    ];
    it.each(attachmentFailures)(
        'rejects unusable attachment: %j',
        (changes) => {
            const context = createContext();
            expect(
                createAssignmentValidationChain().handle({
                    ...context,
                    networkAttachment: {
                        ...context.networkAttachment!,
                        ...changes,
                    },
                }),
            ).toMatchObject({
                ok: false,
                code: 'NETWORK_ATTACHMENT_NOT_READY',
            });
        },
    );

    it('rejects missing attachment', () => {
        expect(
            createAssignmentValidationChain().handle({
                ...createContext(),
                networkAttachment: null,
            }),
        ).toMatchObject({ ok: false, code: 'NETWORK_ATTACHMENT_NOT_READY' });
    });

    it.each(['geocoding', 'networkAttachment'] as const)(
        'rejects another tenant in %s first',
        (field) => {
            const context = createContext();
            expect(
                createAssignmentValidationChain().handle({
                    ...context,
                    [field]: { ...context[field]!, tenantId: 'tenant-b' },
                }),
            ).toMatchObject({ ok: false, code: 'TENANT_MISMATCH' });
        },
    );

    it('accepts manually approved edge attachments and zero coordinates', () => {
        const context = createContext();
        expect(
            createAssignmentValidationChain().handle({
                ...context,
                geocoding: { ...context.geocoding!, latitude: 0, longitude: 0 },
                networkAttachment: {
                    ...context.networkAttachment!,
                    status: 'APPROVED',
                    roadNodeId: null,
                    roadEdgeId: 'edge-1',
                },
            }),
        ).toEqual({ ok: true });
    });

    it('interrupts before network validation if geocoding fails', () => {
        expect(
            createAssignmentValidationChain().handle({
                ...createContext(),
                geocoding: null,
                networkAttachment: null,
            }),
        ).toMatchObject({ ok: false, code: 'GEOCODING_NOT_READY' });
    });

    it('accepts an assignment that passes the complete chain', () => {
        expect(
            createAssignmentValidationChain().handle(createContext()),
        ).toEqual({
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
                context: () => ({
                    ...createContext(),
                    hasDuplicateAssignment: true,
                }),
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
                context: () => ({
                    ...createContext(),
                    geocoding: { ...createContext().geocoding!, latitude: 200 },
                }),
                code: 'INVALID_COORDINATES',
                handler: 'CoordinateValidationHandler',
            },
            {
                name: 'unsupported zone',
                context: () => packageContext({ zoneId: null }),
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

        expect(createAssignmentValidationChain().handle(context)).toMatchObject(
            {
                ok: false,
                code: 'WEIGHT_CAPACITY_EXCEEDED',
                handler: 'WeightCapacityHandler',
            },
        );
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
