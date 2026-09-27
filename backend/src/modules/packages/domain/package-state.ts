import type { PackageStateName } from './package-state.types';

export interface PackageState {
	readonly status: PackageStateName;

	canTransitionTo(targetState: PackageStateName): boolean;
}
