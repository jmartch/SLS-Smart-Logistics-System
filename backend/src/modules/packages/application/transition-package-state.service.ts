import type { PackageTransitionMetadata } from '../domain/events/package-state-changed.event';
import {
    PackageLifecycleRepository,
    type PackageLifecycleResult,
} from '../domain/package-lifecycle.repository';
import type { PackageStateName } from '../domain/package-state.types';

export interface TransitionPackageStateCommand extends PackageTransitionMetadata {
    // tenantId must come from authenticated identity or trusted event metadata.
    readonly tenantId: string;
    readonly packageId: string;
    readonly targetState: PackageStateName;
}

export class TransitionPackageStateService {
    constructor(
        private readonly lifecycleRepository: PackageLifecycleRepository,
    ) {}

    execute(
        command: TransitionPackageStateCommand,
    ): Promise<PackageLifecycleResult> {
        return this.lifecycleRepository.transitionAtomically(
            {
                tenantId: command.tenantId,
                packageId: command.packageId,
            },
            (packageAggregate) => {
                packageAggregate.transitionTo(command.targetState, {
                    changedByUserId: command.changedByUserId,
                    reasonCode: command.reasonCode,
                    correlationId: command.correlationId,
                });
            },
        );
    }
}
