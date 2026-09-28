import { PackageStatus } from '../package-state.types';
import { BasePackageState } from './base-package.state';

export class PendingAssignmentState extends BasePackageState {
    readonly status = PackageStatus.PENDING_ASSIGNMENT;

    protected readonly allowedTransitions = [
        PackageStatus.ASSIGNED_TO_ROUTE,
        PackageStatus.CANCELLED,
    ];
}
