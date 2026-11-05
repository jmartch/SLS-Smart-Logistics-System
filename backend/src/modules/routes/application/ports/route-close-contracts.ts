import { createHash } from 'crypto';
import { RouteClosureMode } from '../../domain/route-closure.types';

export interface DepotReceiptInput {
    readonly depotId: string;
    readonly physicalReceiptConfirmed: boolean;
    readonly assignmentIds: readonly string[];
}

export interface CloseRouteCommand {
    readonly tenantId: string;
    readonly routeId: string;
    readonly requestId: string;
    readonly actorUserId: string;
    readonly correlationId?: string | null;
    readonly mode: RouteClosureMode;
    readonly reasonCode?: string | null;
    readonly notes?: string | null;
    readonly actualDistanceM?: number | null;
    readonly depotReceipt?: DepotReceiptInput | null;
}

export interface CloseRouteResult {
    readonly routeId: string;
    readonly closureId: string;
    readonly state: 'COMPLETED';
    readonly completedAt: Date;
    readonly summary: Record<string, unknown>;
    readonly replayed: boolean;
}


export function computeCloseRouteHash(command: CloseRouteCommand): string {
    const normalized = {
        version: 1,
        operation: 'CLOSE_ROUTE',
        routeId: command.routeId,
        actorUserId: command.actorUserId,
        mode: command.mode,
        reasonCode: command.reasonCode ? command.reasonCode.trim() : null,
        notes: command.notes ? command.notes.trim() : null,
        actualDistanceM:
            command.actualDistanceM !== undefined && command.actualDistanceM !== null
                ? Math.round(command.actualDistanceM * 100) / 100
                : null,
        depotReceipt: command.depotReceipt
            ? {
                depotId: command.depotReceipt.depotId,
                physicalReceiptConfirmed: Boolean(
                    command.depotReceipt.physicalReceiptConfirmed,
                ),
                assignmentIds: [...command.depotReceipt.assignmentIds].sort(),
            }
            : null,
    };

    return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}