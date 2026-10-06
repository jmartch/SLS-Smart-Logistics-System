import { BasePackageState } from './base-package.state';
import { PackageStatus } from '../package-state.types';

export class ReadyForDispatchState extends BasePackageState {
    readonly status = PackageStatus.READY_FOR_DISPATCH;

    protected readonly allowedTransitions = [
        PackageStatus.IN_TRANSIT,
        PackageStatus.PENDING_ASSIGNMENT,
        PackageStatus.CANCELLED,
    ];
}
