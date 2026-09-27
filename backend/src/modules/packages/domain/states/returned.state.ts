import { PackageStatus } from '../package-state.types';
import { BasePackageState } from './base-package.state';

export class ReturnedState extends BasePackageState {
  readonly status = PackageStatus.RETURNED;

  protected readonly allowedTransitions = [];
}
