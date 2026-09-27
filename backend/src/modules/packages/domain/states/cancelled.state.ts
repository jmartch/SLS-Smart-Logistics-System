import { PackageStatus } from '../package-state.types';
import { BasePackageState } from './base-package.state';

export class CancelledState extends BasePackageState {
    readonly status = PackageStatus.CANCELLED;

    protected readonly allowedTransitions = [];
}
