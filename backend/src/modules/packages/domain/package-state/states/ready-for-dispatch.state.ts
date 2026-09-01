import { BasePackageState } from '../core/base-package.state';
import type { PackageStateContext } from '../core/package-state';
import { PackageStatus } from '../core/package-status';
import { InTransitState } from './in-transit.state';

export class ReadyForDispatchState extends BasePackageState {
  readonly status = PackageStatus.READY_FOR_DISPATCH;

  override startTransit(context: PackageStateContext): void {
    context.transitionTo(new InTransitState());
  }
}
