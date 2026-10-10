import { BasePackageState } from './base-package.state';
import { PackageStatus } from '../package-state.types';

export class DeliveryFailedState extends BasePackageState {
    readonly status = PackageStatus.DELIVERY_FAILED;

    protected readonly allowedTransitions = [
        PackageStatus.RESCHEDULED,
        PackageStatus.RETURN_PENDING,
    ];
}
