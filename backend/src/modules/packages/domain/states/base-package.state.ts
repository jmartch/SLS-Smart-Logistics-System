import type { PackageState } from '../package-state';
import type { PackageStateName } from '../package-state.types';

export abstract class BasePackageState implements PackageState {
	abstract readonly status: PackageStateName;

	protected readonly allowedTransitions: readonly PackageStateName[] = [];

	canTransitionTo(targetState: PackageStateName): boolean {
		return this.allowedTransitions.includes(targetState);
	}
}
