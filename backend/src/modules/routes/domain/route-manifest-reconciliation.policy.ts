import {
    RouteManifestOutcome,
    ReconciledManifestMember,
} from './route-closure.types';
import {
    RouteManifestEmptyError,
    RouteManifestInconsistentError,
} from './route-errors';

export interface ManifestDispatchItem {
    readonly assignmentId: string;
    readonly packageId: string;
    readonly routeStopId: string;
}

export interface ReconcileManifestInput {
    readonly routeId: string;
    readonly dispatchManifest: readonly ManifestDispatchItem[];
    readonly membersWithOutcomes: readonly ReconciledManifestMember[];
}

export interface ReconciledManifestResult {
    readonly totalAssigned: number;
    readonly deliveredCount: number;
    readonly failedCount: number;
    readonly rescheduledCount: number;
    readonly returnedCount: number;
    readonly pendingCount: number;
    readonly members: readonly ReconciledManifestMember[];
}

export class RouteManifestReconciliationPolicy {
    static reconcile(input: ReconcileManifestInput): ReconciledManifestResult {
        if (!input.dispatchManifest || input.dispatchManifest.length === 0) {
            throw new RouteManifestEmptyError(input.routeId);
        }

        const expectedTuples = new Set(
            input.dispatchManifest.map(
                (m) => `${m.assignmentId}:${m.packageId}:${m.routeStopId}`,
            ),
        );

        if (expectedTuples.size !== input.dispatchManifest.length) {
            throw new RouteManifestInconsistentError(
                'Dispatch manifest contains duplicate member assignments',
            );
        }

        const resolvedTuples = new Set<string>();
        let deliveredCount = 0;
        let failedCount = 0;
        let rescheduledCount = 0;
        let returnedCount = 0;
        let pendingCount = 0;

        for (const member of input.membersWithOutcomes) {
            const key = `${member.assignmentId}:${member.packageId}:${member.routeStopId}`;
            if (!expectedTuples.has(key)) {
                throw new RouteManifestInconsistentError(
                    `Member '${key}' does not belong to the frozen dispatch manifest of route '${input.routeId}'`,
                );
            }
            if (resolvedTuples.has(key)) {
                throw new RouteManifestInconsistentError(
                    `Member '${key}' appears more than once in the reconciliation result`,
                );
            }
            resolvedTuples.add(key);

            switch (member.outcome) {
                case RouteManifestOutcome.DELIVERED:
                    deliveredCount++;
                    break;
                case RouteManifestOutcome.FAILED:
                    failedCount++;
                    break;
                case RouteManifestOutcome.RESCHEDULED:
                    rescheduledCount++;
                    break;
                case RouteManifestOutcome.RETURNED:
                    returnedCount++;
                    break;
                case RouteManifestOutcome.PENDING:
                    pendingCount++;
                    break;
                default:
                    throw new RouteManifestInconsistentError(
                        `Unknown or invalid outcome '${(member as any).outcome}' for member '${key}'`,
                    );
            }
        }

        if (resolvedTuples.size !== expectedTuples.size) {
            throw new RouteManifestInconsistentError(
                `Not all manifest members were reconciled. Expected ${expectedTuples.size}, resolved ${resolvedTuples.size}`,
            );
        }

        const totalAssigned = input.dispatchManifest.length;
        const sum =
            deliveredCount +
            failedCount +
            rescheduledCount +
            returnedCount +
            pendingCount;

        if (totalAssigned !== sum) {
            throw new RouteManifestInconsistentError(
                `Sum of reconciled categories (${sum}) does not match totalAssigned (${totalAssigned})`,
            );
        }

        return {
            totalAssigned,
            deliveredCount,
            failedCount,
            rescheduledCount,
            returnedCount,
            pendingCount,
            members: Object.freeze([...input.membersWithOutcomes]),
        };
    }
}