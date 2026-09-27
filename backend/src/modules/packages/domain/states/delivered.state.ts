import { BasePackageState } from './base-package.state';
import { PackageStatus } from '../package-state.types';

export class DeliveredState extends BasePackageState {
    readonly status = PackageStatus.DELIVERED;

    protected readonly allowedTransitions = [];
}
