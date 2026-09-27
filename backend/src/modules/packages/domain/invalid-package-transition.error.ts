import type { PackageStateName } from './package-state.types';

export class InvalidPackageTransitionError extends Error {
    readonly code = 'INVALID_PACKAGE_TRANSITION';
    readonly attemptedAction = 'transitionTo';

    constructor(
        readonly currentStatus: PackageStateName,
        readonly targetStatus: PackageStateName,
    ) {
        super(
            `Cannot transition package from ${currentStatus} to ${targetStatus}`,
        );

        this.name = 'InvalidPackageTransitionError';
    }
}
