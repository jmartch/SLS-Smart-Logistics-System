import { BasePackageState } from './base-package.state';
import { PackageStatus } from '../package-state.types';

export class InTransitState extends BasePackageState {
    readonly status = PackageStatus.IN_TRANSIT;

    protected readonly allowedTransitions = [PackageStatus.OUT_FOR_DELIVERY];
}
