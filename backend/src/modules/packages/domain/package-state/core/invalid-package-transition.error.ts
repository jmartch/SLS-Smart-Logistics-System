import type { PackageStatus, PackageTransitionAction } from './package-status';

export class InvalidPackageTransitionError extends Error {
  readonly code = 'INVALID_PACKAGE_TRANSITION';

  constructor(
    readonly currentStatus: PackageStatus,
    readonly attemptedAction: PackageTransitionAction,
  ) {
    super(
      `Cannot execute ${attemptedAction} while package is ${currentStatus}`,
    );

    this.name = 'InvalidPackageTransitionError';
  }
}
