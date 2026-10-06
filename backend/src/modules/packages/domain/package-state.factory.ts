import { type PackageState, getPackageState } from './package-states';
import type { PackageStateName } from './package-state.types';

export function createPackageState(stateName: PackageStateName): PackageState {
    return getPackageState(stateName);
}
