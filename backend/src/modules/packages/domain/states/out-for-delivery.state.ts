import { BasePackageState } from './base-package.state';
import { PackageStatus } from '../package-state.types';

export class OutForDeliveryState extends BasePackageState {
  readonly status = PackageStatus.OUT_FOR_DELIVERY;

  protected readonly allowedTransitions = [
    PackageStatus.DELIVERED,
    PackageStatus.DELIVERY_FAILED,
  ];
}
