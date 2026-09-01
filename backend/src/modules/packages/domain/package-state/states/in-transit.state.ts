import { BasePackageState } from '../core/base-package.state';
import type { PackageStateContext } from '../core/package-state';
import { PackageStatus } from '../core/package-status';
import { OutForDeliveryState } from './out-for-delivery.state';

export class InTransitState extends BasePackageState {
  readonly status = PackageStatus.IN_TRANSIT;

  override startDelivery(context: PackageStateContext): void {
    context.transitionTo(new OutForDeliveryState());
  }
}
