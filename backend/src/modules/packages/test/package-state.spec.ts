import { InvalidPackageTransitionError } from '../domain/invalid-package-transition.error';
import { PackageAggregate } from '../domain/package.aggregate';
import { PackageStatus } from '../domain/package-state.types';

describe('Package State pattern', () => {
    const reconstitute = (state: keyof typeof PackageStatus) =>
        PackageAggregate.reconstitute({
            id: 'package-1',
            tenantId: 'tenant-1',
            state: PackageStatus[state],
        });

    it('reconstitutes ready for dispatch without generating events', () => {
        const packageContext = reconstitute('READY_FOR_DISPATCH');

        expect(packageContext.state).toBe(PackageStatus.READY_FOR_DISPATCH);
        expect(packageContext.pullDomainEvents()).toEqual([]);
    });

    it('allows reverting to pending assignment when route is cancelled before dispatch', () => {
        const readyPackage = reconstitute('READY_FOR_DISPATCH');
        readyPackage.transitionTo(PackageStatus.PENDING_ASSIGNMENT);
        expect(readyPackage.state).toBe(PackageStatus.PENDING_ASSIGNMENT);

        const assignedPackage = reconstitute('ASSIGNED_TO_ROUTE');
        assignedPackage.transitionTo(PackageStatus.PENDING_ASSIGNMENT);
        expect(assignedPackage.state).toBe(PackageStatus.PENDING_ASSIGNMENT);
    });

    it('executes the successful delivery flow', () => {
        const packageContext = reconstitute('READY_FOR_DISPATCH');

        packageContext.transitionTo(PackageStatus.IN_TRANSIT);
        packageContext.transitionTo(PackageStatus.OUT_FOR_DELIVERY);
        packageContext.transitionTo(PackageStatus.DELIVERED);

        expect(packageContext.state).toBe(PackageStatus.DELIVERED);
        expect(packageContext.pullDomainEvents()).toHaveLength(3);
    });

    it('executes the failed delivery flow', () => {
        const packageContext = reconstitute('READY_FOR_DISPATCH');

        packageContext.transitionTo(PackageStatus.IN_TRANSIT);
        packageContext.transitionTo(PackageStatus.OUT_FOR_DELIVERY);
        packageContext.transitionTo(PackageStatus.DELIVERY_FAILED);

        expect(packageContext.state).toBe(PackageStatus.DELIVERY_FAILED);
        expect(packageContext.pullDomainEvents()).toHaveLength(3);
    });

    it('rejects delivery before the package is out for delivery', () => {
        const packageContext = reconstitute('READY_FOR_DISPATCH');

        expect(() =>
            packageContext.transitionTo(PackageStatus.DELIVERED),
        ).toThrow(InvalidPackageTransitionError);

        try {
            packageContext.transitionTo(PackageStatus.DELIVERED);
        } catch (error) {
            expect(error).toMatchObject({
                code: 'INVALID_PACKAGE_TRANSITION',
                currentStatus: PackageStatus.READY_FOR_DISPATCH,
                targetStatus: PackageStatus.DELIVERED,
                attemptedAction: 'transitionTo',
            });
        }

        expect(packageContext.state).toBe(PackageStatus.READY_FOR_DISPATCH);
        expect(packageContext.pullDomainEvents()).toEqual([]);
    });

    it('rejects transitions after delivery', () => {
        const packageContext = reconstitute('DELIVERED');

        expect(() =>
            packageContext.transitionTo(PackageStatus.IN_TRANSIT),
        ).toThrow(InvalidPackageTransitionError);
        expect(packageContext.state).toBe(PackageStatus.DELIVERED);
    });
});
