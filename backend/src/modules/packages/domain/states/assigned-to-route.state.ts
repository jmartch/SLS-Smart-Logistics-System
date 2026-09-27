import { PackageStatus } from '../package-state.types';
import { BasePackageState } from './base-package.state';

export class AssignedToRouteState extends BasePackageState {
  readonly status = PackageStatus.ASSIGNED_TO_ROUTE;

  protected readonly allowedTransitions = [
    PackageStatus.READY_FOR_DISPATCH,
    PackageStatus.CANCELLED,
  ];
}
