import { RouteState } from './route-state';
import { RouteStopState } from './route-stop-state';
import { RouteClosureMode } from './route-closure.types';
import {
    RouteStateConflictError,
    RouteValidationError,
    RouteHasPendingStopsError,
    RouteCustodyUnresolvedError,
} from './route-errors';

export interface CanCloseRouteInput {
    readonly routeId: string;
    readonly currentState: RouteState;
    readonly startedAt: Date | null | undefined;
    readonly mode: RouteClosureMode;
    readonly reasonCode?: string | null;
    readonly notes?: string | null;
    readonly stopStates: readonly { readonly stopId: string; readonly state: string }[];
    readonly pendingActiveCargoAssignmentsCount: number;
}

export class RouteClosurePolicy {
    static validateClosureEligibility(input: CanCloseRouteInput): void {
        if (
            input.currentState !== RouteState.IN_PROGRESS &&
            input.currentState !== RouteState.INTERRUPTED
        ) {
            throw new RouteStateConflictError(
                input.routeId,
                input.currentState,
                'complete',
            );
        }

        if (!input.startedAt) {
            throw new RouteValidationError(
                'Route cannot be completed without a valid startedAt timestamp',
            );
        }

        if (input.pendingActiveCargoAssignmentsCount > 0) {
            throw new RouteCustodyUnresolvedError(
                `Cannot close route '${input.routeId}': ${input.pendingActiveCargoAssignmentsCount} cargo assignments remain active without confirmed depot receipt`,
            );
        }

        if (input.mode === RouteClosureMode.REGULAR) {
            const hasPendingStops = input.stopStates.some(
                (s) => s.state === RouteStopState.PENDING,
            );
            if (hasPendingStops) {
                throw new RouteHasPendingStopsError(input.routeId);
            }
            if (input.reasonCode && input.reasonCode.trim().length > 0) {
                throw new RouteValidationError(
                    'reasonCode is not permitted for REGULAR route closure',
                );
            }
        } else if (input.mode === RouteClosureMode.FORCED) {
            if (!input.reasonCode || input.reasonCode.trim().length === 0) {
                throw new RouteValidationError(
                    'reasonCode is mandatory for FORCED route closure',
                );
            }
            const trimmedNotes = input.notes ? input.notes.trim() : '';
            if (trimmedNotes.length < 1 || trimmedNotes.length > 1000) {
                throw new RouteValidationError(
                    'notes must contain between 1 and 1000 characters for FORCED route closure',
                );
            }
        } else {
            throw new RouteValidationError(`Invalid RouteClosureMode: '${input.mode}'`);
        }
    }
}