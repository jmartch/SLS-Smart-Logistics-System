import type { PackageStatus } from './package-status';

export interface PackageStateContext {
  transitionTo(state: PackageState): void;
}

export interface PackageState {
  readonly status: PackageStatus;

  startTransit(context: PackageStateContext): void;
  startDelivery(context: PackageStateContext): void;
  deliver(context: PackageStateContext): void;
  failDelivery(context: PackageStateContext): void;
}
