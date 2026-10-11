import {
    RouteClosureMode,
    ReconciledManifestMember,
    RouteStopClosureDetail,
    RouteFailureReasonBreakdown,
    RouteIncidentClosureDetail,
} from './route-closure.types';
import {
    RouteValidationError,
    RouteManifestEmptyError,
} from './route-errors';

export interface RouteClosureSummaryProps {
    readonly closureId: string;
    readonly tenantId: string;
    readonly routeId: string;
    readonly mode: RouteClosureMode;
    readonly actorUserId: string;
    readonly correlationId?: string | null;
    readonly reasonCode?: string | null;
    readonly notes?: string | null;
    readonly schemaVersion?: 1;
    readonly startedAt: Date;
    readonly completedAt: Date;
    readonly totalAssigned: number;
    readonly deliveredCount: number;
    readonly failedCount: number;
    readonly rescheduledCount: number;
    readonly returnedCount: number;
    readonly pendingCount: number;
    readonly plannedDistanceM: number;
    readonly actualDistanceM?: number | null;
    readonly members: readonly ReconciledManifestMember[];
    readonly stops: readonly RouteStopClosureDetail[];
    readonly failureReasons?: readonly RouteFailureReasonBreakdown[];
    readonly incidents?: readonly RouteIncidentClosureDetail[];
}

export class RouteClosureSummary {
    readonly closureId: string;
    readonly tenantId: string;
    readonly routeId: string;
    readonly mode: RouteClosureMode;
    readonly actorUserId: string;
    readonly correlationId: string | null;
    readonly reasonCode: string | null;
    readonly notes: string | null;
    readonly schemaVersion: 1;
    readonly startedAt: Date;
    readonly completedAt: Date;
    readonly totalAssigned: number;
    readonly deliveredCount: number;
    readonly failedCount: number;
    readonly rescheduledCount: number;
    readonly returnedCount: number;
    readonly pendingCount: number;
    readonly plannedDistanceM: number;
    readonly actualDistanceM: number | null;
    readonly members: readonly ReconciledManifestMember[];
    readonly stops: readonly RouteStopClosureDetail[];
    readonly failureReasons: readonly RouteFailureReasonBreakdown[];
    readonly incidents: readonly RouteIncidentClosureDetail[];

    constructor(props: RouteClosureSummaryProps) {
        if (props.completedAt.getTime() < props.startedAt.getTime()) {
            throw new RouteValidationError(
                'completedAt cannot be earlier than startedAt',
            );
        }

        if (props.totalAssigned <= 0) {
            throw new RouteManifestEmptyError(props.routeId);
        }

        const counts = [
            props.deliveredCount,
            props.failedCount,
            props.rescheduledCount,
            props.returnedCount,
            props.pendingCount,
        ];

        if (counts.some((c) => c < 0 || !Number.isInteger(c))) {
            throw new RouteValidationError(
                'All category counts must be non-negative integers',
            );
        }

        const sumCounts = counts.reduce((acc, c) => acc + c, 0);
        if (props.totalAssigned !== sumCounts) {
            throw new RouteValidationError(
                `totalAssigned (${props.totalAssigned}) does not match sum of category counts (${sumCounts})`,
            );
        }

        if (props.actualDistanceM !== undefined && props.actualDistanceM !== null) {
            if (
                !Number.isFinite(props.actualDistanceM) ||
                props.actualDistanceM < 0
            ) {
                throw new RouteValidationError(
                    'actualDistanceM must be a non-negative finite number when provided',
                );
            }
            this.actualDistanceM = Math.round(props.actualDistanceM * 100) / 100;
        } else {
            this.actualDistanceM = null;
        }

        this.closureId = props.closureId;
        this.tenantId = props.tenantId;
        this.routeId = props.routeId;
        this.mode = props.mode;
        this.actorUserId = props.actorUserId;
        this.correlationId = props.correlationId ?? null;
        this.reasonCode = props.reasonCode ? props.reasonCode.trim() : null;
        this.notes = props.notes ? props.notes.trim() : null;
        this.schemaVersion = 1;
        this.startedAt = new Date(props.startedAt.getTime());
        this.completedAt = new Date(props.completedAt.getTime());
        this.totalAssigned = props.totalAssigned;
        this.deliveredCount = props.deliveredCount;
        this.failedCount = props.failedCount;
        this.rescheduledCount = props.rescheduledCount;
        this.returnedCount = props.returnedCount;
        this.pendingCount = props.pendingCount;
        this.plannedDistanceM = props.plannedDistanceM;

        this.members = Object.freeze([...props.members]);
        this.stops = Object.freeze([...props.stops]);
        this.failureReasons = Object.freeze([...(props.failureReasons ?? [])]);
        this.incidents = Object.freeze([...(props.incidents ?? [])]);

        Object.freeze(this);
    }

    get actualDurationMs(): number {
        return this.completedAt.getTime() - this.startedAt.getTime();
    }

    get actualDurationS(): number {
        return Math.floor(this.actualDurationMs / 1000);
    }

    get deliveryEffectivenessRatio(): number {
        return this.totalAssigned > 0
            ? this.deliveredCount / this.totalAssigned
            : 0;
    }

    get distanceDeltaM(): number | null {
        if (this.actualDistanceM === null) return null;
        return this.actualDistanceM - this.plannedDistanceM;
    }

    get distanceRatio(): number | null {
        if (this.actualDistanceM === null || this.plannedDistanceM <= 0) {
            return null;
        }
        return this.actualDistanceM / this.plannedDistanceM;
    }

    toSnapshot(): Record<string, unknown> {
        return {
            schemaVersion: this.schemaVersion,
            closureId: this.closureId,
            tenantId: this.tenantId,
            routeId: this.routeId,
            mode: this.mode,
            actorUserId: this.actorUserId,
            correlationId: this.correlationId,
            reasonCode: this.reasonCode,
            notes: this.notes,
            startedAt: this.startedAt.toISOString(),
            completedAt: this.completedAt.toISOString(),
            actualDurationMs: this.actualDurationMs,
            actualDurationS: this.actualDurationS,
            totalAssigned: this.totalAssigned,
            deliveredCount: this.deliveredCount,
            failedCount: this.failedCount,
            rescheduledCount: this.rescheduledCount,
            returnedCount: this.returnedCount,
            pendingCount: this.pendingCount,
            deliveryEffectivenessRatio: this.deliveryEffectivenessRatio,
            plannedDistanceM: this.plannedDistanceM,
            actualDistanceM: this.actualDistanceM,
            distanceDeltaM: this.distanceDeltaM,
            distanceRatio: this.distanceRatio,
            members: this.members.map((m) => ({ ...m })),
            stops: this.stops.map((s) => ({ ...s })),
            failureReasons: this.failureReasons.map((f) => ({ ...f })),
            incidents: this.incidents.map((i) => ({
                ...i,
                reportedAt: i.reportedAt.toISOString(),
            })),
        };
    }
}