import { PackageStatus } from '../package-state.types';
import { BasePackageState } from './base-package.state';

export class ClassifiedState extends BasePackageState {
    readonly status = PackageStatus.CLASSIFIED;

    protected readonly allowedTransitions = [
        PackageStatus.PENDING_ASSIGNMENT,
        PackageStatus.ASSIGNED_TO_ROUTE,
        PackageStatus.CANCELLED,
    ];
}
