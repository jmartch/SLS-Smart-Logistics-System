export type StopTerminalOutcome = 'DELIVERED' | 'FAILED';
export type StopResolutionState = 'PENDING' | 'COMPLETED' | 'FAILED';

export interface StopResolutionInput {
  readonly manifestPackageIds: readonly string[];
  readonly terminalOutcomes: ReadonlyMap<string, StopTerminalOutcome>;
}

export class DeliveryStopResolutionPolicy {
  static resolve(input: StopResolutionInput): StopResolutionState {
    const { manifestPackageIds, terminalOutcomes } = input;

    if (manifestPackageIds.length === 0) {
      return 'PENDING';
    }

    for (const packageId of manifestPackageIds) {
      if (!terminalOutcomes.has(packageId)) {
        return 'PENDING';
      }
    }

    const hasAnyFailure = manifestPackageIds.some(
      (pkgId) => terminalOutcomes.get(pkgId) === 'FAILED',
    );

    return hasAnyFailure ? 'FAILED' : 'COMPLETED';
  }
}
