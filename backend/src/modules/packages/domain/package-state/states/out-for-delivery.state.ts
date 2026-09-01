import { BasePackageState } from '../core/base-package.state';
import type { PackageStateContext } from '../core/package-state';
import { PackageStatus } from '../core/package-status';
import { DeliveredState } from './delivered.state';
import { DeliveryFailedState } from './delivery-failed.state';

export class OutForDeliveryState extends BasePackageState {
  readonly status = PackageStatus.OUT_FOR_DELIVERY;

  override deliver(context: PackageStateContext): void {
    context.transitionTo(new DeliveredState());
  }

  override failDelivery(context: PackageStateContext): void {
    context.transitionTo(new DeliveryFailedState());
  }
}
