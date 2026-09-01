import { InvalidPackageTransitionError } from './invalid-package-transition.error';
import type { PackageState, PackageStateContext } from './package-state';
import type { PackageStatus, PackageTransitionAction } from './package-status';

export abstract class BasePackageState implements PackageState {
  abstract readonly status: PackageStatus;

  startTransit(_context: PackageStateContext): void {
    this.reject('startTransit');
  }

  startDelivery(_context: PackageStateContext): void {
    this.reject('startDelivery');
  }

  deliver(_context: PackageStateContext): void {
    this.reject('deliver');
  }

  failDelivery(_context: PackageStateContext): void {
    this.reject('failDelivery');
  }

  protected reject(action: PackageTransitionAction): never {
    throw new InvalidPackageTransitionError(this.status, action);
  }
}
