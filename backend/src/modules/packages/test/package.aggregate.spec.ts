import { InvalidPackageTransitionError } from '../domain/invalid-package-transition.error';
import { PackageAggregate } from '../domain/package.aggregate';
import type { PackageStateName } from '../domain/package-state.types';

const packageId = '10000000-0000-4000-8000-000000000001';
const tenantId = '20000000-0000-4000-8000-000000000001';
const changedByUserId = '30000000-0000-4000-8000-000000000001';

function reconstitute(state: PackageStateName): PackageAggregate {
    return PackageAggregate.reconstitute({
        id: packageId,
        tenantId,
        state,
    });
}

describe('PackageAggregate State pattern', () => {
    it.each<[PackageStateName, PackageStateName]>([
        ['REGISTERED', 'CLASSIFIED'],
        ['CLASSIFIED', 'PENDING_ASSIGNMENT'],
        ['CLASSIFIED', 'ASSIGNED_TO_ROUTE'],
        ['PENDING_ASSIGNMENT', 'ASSIGNED_TO_ROUTE'],
        ['ASSIGNED_TO_ROUTE', 'READY_FOR_DISPATCH'],
        ['READY_FOR_DISPATCH', 'IN_TRANSIT'],
        ['IN_TRANSIT', 'OUT_FOR_DELIVERY'],
        ['OUT_FOR_DELIVERY', 'DELIVERED'],
        ['OUT_FOR_DELIVERY', 'DELIVERY_FAILED'],
        ['DELIVERY_FAILED', 'RESCHEDULED'],
        ['DELIVERY_FAILED', 'RETURN_PENDING'],
        ['RESCHEDULED', 'ASSIGNED_TO_ROUTE'],
        ['RETURN_PENDING', 'RETURNED'],
    ])('allows %s -> %s', (fromState, toState) => {
        const packageAggregate = reconstitute(fromState);

        packageAggregate.transitionTo(toState, {
            changedByUserId,
            reasonCode: 'TEST_TRANSITION',
        });

        expect(packageAggregate.state).toBe(toState);
        expect(packageAggregate.pullDomainEvents()).toEqual([
            expect.objectContaining({
                aggregateId: packageId,
                tenantId,
                fromState,
                toState,
                changedByUserId,
                reasonCode: 'TEST_TRANSITION',
                version: 1,
            }),
        ]);
    });

    it('rejects an invalid transition without changing state or generating events', () => {
        const packageAggregate = reconstitute('REGISTERED');

        expect(() =>
            packageAggregate.transitionTo('DELIVERED', {
                changedByUserId,
            }),
        ).toThrow(InvalidPackageTransitionError);

        expect(packageAggregate.state).toBe('REGISTERED');
        expect(packageAggregate.pullDomainEvents()).toEqual([]);
    });

    it('allows cancellation before route execution begins', () => {
        const packageAggregate = reconstitute('PENDING_ASSIGNMENT');

        packageAggregate.transitionTo('CANCELLED', {
            changedByUserId,
            reasonCode: 'CUSTOMER_REQUEST',
        });

        expect(packageAggregate.state).toBe('CANCELLED');
    });

    it.each<PackageStateName>(['DELIVERED', 'RETURNED', 'CANCELLED'])(
        'treats %s as a terminal state',
        (terminalState) => {
            const packageAggregate = reconstitute(terminalState);

            expect(() =>
                packageAggregate.transitionTo('CLASSIFIED', {
                    changedByUserId,
                }),
            ).toThrow(InvalidPackageTransitionError);

            expect(packageAggregate.state).toBe(terminalState);
            expect(packageAggregate.pullDomainEvents()).toEqual([]);
        },
    );

    it('does not generate an event when reconstituting persisted state', () => {
        const packageAggregate = reconstitute('CLASSIFIED');

        expect(packageAggregate.state).toBe('CLASSIFIED');
        expect(packageAggregate.pullDomainEvents()).toEqual([]);
    });

    it('drains generated events after they are pulled', () => {
        const packageAggregate = reconstitute('REGISTERED');

        packageAggregate.transitionTo('CLASSIFIED', {
            changedByUserId,
        });

        expect(packageAggregate.pullDomainEvents()).toHaveLength(1);
        expect(packageAggregate.pullDomainEvents()).toEqual([]);
    });
});
