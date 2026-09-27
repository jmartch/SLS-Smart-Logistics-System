import type { PackageStateChangedEvent } from './events/package-state-changed.event';
import type { PackageAggregate } from './package.aggregate';

export interface LockedPackageIdentity {
    readonly tenantId: string;
    readonly packageId: string;
}

export type PackageLifecycleOperation = (
    packageAggregate: PackageAggregate,
) => void;

export type PackageLifecycleResult =
    | { readonly kind: 'NOT_FOUND' }
    | {
          readonly kind: 'TRANSITIONED';
          readonly event: PackageStateChangedEvent;
      };

export abstract class PackageLifecycleRepository {
    abstract transitionAtomically(
        identity: LockedPackageIdentity,
        operation: PackageLifecycleOperation,
    ): Promise<PackageLifecycleResult>;
}
