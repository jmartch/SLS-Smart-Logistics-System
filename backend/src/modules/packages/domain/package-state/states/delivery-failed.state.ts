import { BasePackageState } from '../core/base-package.state';
import { PackageStatus } from '../core/package-status';

export class DeliveryFailedState extends BasePackageState {
  readonly status = PackageStatus.DELIVERY_FAILED;
}
