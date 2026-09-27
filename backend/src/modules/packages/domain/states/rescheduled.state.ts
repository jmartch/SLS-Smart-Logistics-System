import { PackageStatus } from '../package-state.types';
import { BasePackageState } from './base-package.state';

export class RescheduledState extends BasePackageState {
  readonly status = PackageStatus.RESCHEDULED;

  protected readonly allowedTransitions = [
    PackageStatus.ASSIGNED_TO_ROUTE,
    PackageStatus.CANCELLED,
  ];
}
