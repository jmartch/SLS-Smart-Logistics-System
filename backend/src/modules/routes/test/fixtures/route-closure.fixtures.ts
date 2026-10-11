import { RouteStopState } from '../../domain/route-stop-state';

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

export interface ManifestMemberFixture {
    readonly assignmentId: string;
    readonly packageId: string;
    readonly routeStopId: string;
}

export interface OperationalFactFixture {
    readonly assignmentId: string;
    readonly packageId: string;
    readonly routeStopId: string;
    readonly outcome: RouteManifestOutcome;
    readonly attempted: boolean;
    readonly physicalReceiptConfirmed: boolean;
    readonly physicalReceiptDepotId?: string;
    readonly failureReasonCode?: string;
}

export interface RouteClosureScenarioFixture {
    readonly tenantId: string;
    readonly routeId: string;
    readonly mode: RouteClosureMode;
    readonly reasonCode?: string;
    readonly notes?: string;
    readonly manifest: readonly ManifestMemberFixture[];
    readonly facts: readonly OperationalFactFixture[];
    readonly stopStates: Record<string, string>;
    readonly expectedSummary: {
        readonly totalAssigned: number;
        readonly deliveredCount: number;
        readonly failedCount: number;
        readonly rescheduledCount: number;
        readonly returnedCount: number;
        readonly pendingCount: number;
        readonly deliveryEffectivenessRatio: number;
    };
}

export function createSevenPackagesForcedScenarioFixture(): RouteClosureScenarioFixture {
    const tenantId = 'tenant-a';
    const routeId = 'route-100';

    const manifest: ManifestMemberFixture[] = [
        { assignmentId: 'asg-1', packageId: 'pkg-1', routeStopId: 'stop-1' },
        { assignmentId: 'asg-2', packageId: 'pkg-2', routeStopId: 'stop-1' },
        { assignmentId: 'asg-3', packageId: 'pkg-3', routeStopId: 'stop-2' },
        { assignmentId: 'asg-4', packageId: 'pkg-4', routeStopId: 'stop-3' },
        { assignmentId: 'asg-5', packageId: 'pkg-5', routeStopId: 'stop-3' },
        { assignmentId: 'asg-6', packageId: 'pkg-6', routeStopId: 'stop-4' },
        { assignmentId: 'asg-7', packageId: 'pkg-7', routeStopId: 'stop-4' },
    ];

    const facts: OperationalFactFixture[] = [
        {
            assignmentId: 'asg-1',
            packageId: 'pkg-1',
            routeStopId: 'stop-1',
            outcome: RouteManifestOutcome.DELIVERED,
            attempted: true,
            physicalReceiptConfirmed: false,
        },
        {
            assignmentId: 'asg-2',
            packageId: 'pkg-2',
            routeStopId: 'stop-1',
            outcome: RouteManifestOutcome.DELIVERED,
            attempted: true,
            physicalReceiptConfirmed: false,
        },
        {
            assignmentId: 'asg-3',
            packageId: 'pkg-3',
            routeStopId: 'stop-2',
            outcome: RouteManifestOutcome.FAILED,
            attempted: true,
            physicalReceiptConfirmed: true,
            physicalReceiptDepotId: 'depot-1',
            failureReasonCode: 'RECIPIENT_NOT_HOME',
        },
        {
            assignmentId: 'asg-4',
            packageId: 'pkg-4',
            routeStopId: 'stop-3',
            outcome: RouteManifestOutcome.RESCHEDULED,
            attempted: true,
            physicalReceiptConfirmed: true,
            physicalReceiptDepotId: 'depot-1',
            failureReasonCode: 'RESCHEDULE_REQUESTED',
        },
        {
            assignmentId: 'asg-5',
            packageId: 'pkg-5',
            routeStopId: 'stop-3',
            outcome: RouteManifestOutcome.RETURNED,
            attempted: true,
            physicalReceiptConfirmed: true,
            physicalReceiptDepotId: 'depot-1',
            failureReasonCode: 'REJECTED_BY_RECIPIENT',
        },
        {
            assignmentId: 'asg-6',
            packageId: 'pkg-6',
            routeStopId: 'stop-4',
            outcome: RouteManifestOutcome.PENDING,
            attempted: false,
            physicalReceiptConfirmed: true,
            physicalReceiptDepotId: 'depot-1',
        },
        {
            assignmentId: 'asg-7',
            packageId: 'pkg-7',
            routeStopId: 'stop-4',
            outcome: RouteManifestOutcome.PENDING,
            attempted: false,
            physicalReceiptConfirmed: true,
            physicalReceiptDepotId: 'depot-1',
        },
    ];

    const stopStates = {
        'stop-1': RouteStopState.COMPLETED,
        'stop-2': RouteStopState.FAILED,
        'stop-3': RouteStopState.FAILED,
        'stop-4': RouteStopState.PENDING,
    };

    return {
        tenantId,
        routeId,
        mode: RouteClosureMode.FORCED,
        reasonCode: 'VEHICLE_BREAKDOWN',
        notes: 'Avería mecánica en sector norte; carga restante recibida en depósito.',
        manifest,
        facts,
        stopStates,
        expectedSummary: {
            totalAssigned: 7,
            deliveredCount: 2,
            failedCount: 1,
            rescheduledCount: 1,
            returnedCount: 1,
            pendingCount: 2,
            deliveryEffectivenessRatio: 2 / 7,
        },
    };
}

export function createRegularAllDeliveredScenarioFixture(): RouteClosureScenarioFixture {
    const tenantId = 'tenant-a';
    const routeId = 'route-101';

    const manifest: ManifestMemberFixture[] = [
        { assignmentId: 'asg-1', packageId: 'pkg-1', routeStopId: 'stop-1' },
        { assignmentId: 'asg-2', packageId: 'pkg-2', routeStopId: 'stop-2' },
        { assignmentId: 'asg-3', packageId: 'pkg-3', routeStopId: 'stop-3' },
    ];

    const facts: OperationalFactFixture[] = manifest.map((m) => ({
        assignmentId: m.assignmentId,
        packageId: m.packageId,
        routeStopId: m.routeStopId,
        outcome: RouteManifestOutcome.DELIVERED,
        attempted: true,
        physicalReceiptConfirmed: false,
    }));

    const stopStates = {
        'stop-1': RouteStopState.COMPLETED,
        'stop-2': RouteStopState.COMPLETED,
        'stop-3': RouteStopState.COMPLETED,
    };

    return {
        tenantId,
        routeId,
        mode: RouteClosureMode.REGULAR,
        manifest,
        facts,
        stopStates,
        expectedSummary: {
            totalAssigned: 3,
            deliveredCount: 3,
            failedCount: 0,
            rescheduledCount: 0,
            returnedCount: 0,
            pendingCount: 0,
            deliveryEffectivenessRatio: 1.0,
        },
    };
}