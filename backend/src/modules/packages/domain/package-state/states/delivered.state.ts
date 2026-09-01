import { BasePackageState } from '../core/base-package.state';
import { PackageStatus } from '../core/package-status';

export class DeliveredState extends BasePackageState {
  readonly status = PackageStatus.DELIVERED;
}
