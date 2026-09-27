import { PackageStatus } from '../package-state.types';
import { BasePackageState } from './base-package.state';

export class ReturnPendingState extends BasePackageState {
  readonly status = PackageStatus.RETURN_PENDING;

  protected readonly allowedTransitions = [PackageStatus.RETURNED];
}
