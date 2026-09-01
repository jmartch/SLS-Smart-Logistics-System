import type { PackageState, PackageStateContext } from './package-state';
import type { PackageStatus } from './package-status';
import { ReadyForDispatchState } from '../states/ready-for-dispatch.state';

export class Package implements PackageStateContext {
  private state: PackageState;
  private readonly statusHistory: PackageStatus[];

  constructor(
    readonly id: string,
    initialState: PackageState = new ReadyForDispatchState(),
  ) {
    this.state = initialState;
    this.statusHistory = [initialState.status];
  }

  get status(): PackageStatus {
    return this.state.status;
  }

  get history(): readonly PackageStatus[] {
    return [...this.statusHistory];
  }

  startTransit(): void {
    this.state.startTransit(this);
  }

  startDelivery(): void {
    this.state.startDelivery(this);
  }

  deliver(): void {
    this.state.deliver(this);
  }

  failDelivery(): void {
    this.state.failDelivery(this);
  }

  transitionTo(state: PackageState): void {
    this.state = state;
    this.statusHistory.push(state.status);
  }
}
