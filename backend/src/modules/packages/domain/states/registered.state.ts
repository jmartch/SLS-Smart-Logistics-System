import { PackageStatus } from '../package-state.types';
import { BasePackageState } from './base-package.state';

export class RegisteredState extends BasePackageState {
  readonly status = PackageStatus.REGISTERED;

  protected readonly allowedTransitions = [
    PackageStatus.CLASSIFIED,
    PackageStatus.CANCELLED,
  ];
}
