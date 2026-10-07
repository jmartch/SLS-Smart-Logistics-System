export const RouteClosureMode = {
    REGULAR: 'REGULAR',
    FORCED: 'FORCED',
} as const;
export type RouteClosureMode =
    (typeof RouteClosureMode)[keyof typeof RouteClosureMode];

export const RouteManifestOutcome = {
    DELIVERED: 'DELIVERED',
    FAILED: 'FAILED',
    RESCHEDULED: 'RESCHEDULED',
    RETURNED: 'RETURNED',
    PENDING: 'PENDING',
} as const;
export type RouteManifestOutcome =
    (typeof RouteManifestOutcome)[keyof typeof RouteManifestOutcome];

export const RouteClosureDisposition = {
    VISITED: 'VISITED',
    PARTIALLY_VISITED: 'PARTIALLY_VISITED',
    NOT_VISITED: 'NOT_VISITED',
} as const;
export type RouteClosureDisposition =
    (typeof RouteClosureDisposition)[keyof typeof RouteClosureDisposition];

export interface ReconciledManifestMember {
    readonly assignmentId: string;
    readonly packageId: string;
    readonly routeStopId: string;
    readonly outcome: RouteManifestOutcome;
    readonly failureReasonCode?: string | null;
    readonly receiptConfirmed: boolean;
    readonly depotId?: string | null;
}

export interface RouteFailureReasonBreakdown {
    readonly reasonCode: string;
    readonly count: number;
}

export interface RouteStopClosureDetail {
    readonly routeStopId: string;
    readonly stopNumber: number;
    readonly stopState: string;
    readonly disposition: RouteClosureDisposition;
}

export interface RouteIncidentClosureDetail {
    readonly incidentId: string;
    readonly type: string;
    readonly status: string;
    readonly reportedAt: Date;
    readonly description?: string | null;
}