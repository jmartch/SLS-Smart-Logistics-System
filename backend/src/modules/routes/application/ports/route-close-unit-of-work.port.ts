import { Route } from '../../domain/route';
import { RouteClosureSummary } from '../../domain/route-closure-summary';
import { RouteDomainEvent } from '../../domain/events/route-lifecycle.event';
import {
    RouteClosureMode,
    ReconciledManifestMember,
} from '../../domain/route-closure.types';
import { ManifestDispatchItem } from '../../domain/route-manifest-reconciliation.policy';

export interface PersistedRouteClosure {
    readonly id: string;
    readonly tenantId: string;
    readonly routeId: string;
    readonly requestId: string;
    readonly actorUserId: string;
    readonly requestHash: string;
    readonly mode: RouteClosureMode;
    readonly completedAt: Date;
    readonly resultSnapshot: Record<string, unknown>;
}

export interface RouteClosureAuditEntry {
    readonly tenantId: string;
    readonly actorUserId: string;
    readonly action: 'ROUTE_CLOSED';
    readonly routeId: string;
    readonly closureId: string;
    readonly previousState: string;
    readonly newState: 'COMPLETED';
    readonly mode: RouteClosureMode;
    readonly reasonCode?: string | null;
    readonly requestId: string;
    readonly requestHash: string;
    readonly correlationId?: string | null;
    readonly timestamp: Date;
    readonly details?: Record<string, unknown>;
}

export interface RouteCloseSession {
    lockAndGetRoute(tenantId: string, routeId: string): Promise<Route | null>;
    findClosureByRouteId(
        tenantId: string,
        routeId: string,
    ): Promise<PersistedRouteClosure | null>;
    findClosureByRequestId(
        tenantId: string,
        requestId: string,
    ): Promise<PersistedRouteClosure | null>;
    getDispatchManifest(
        tenantId: string,
        routeId: string,
    ): Promise<readonly ManifestDispatchItem[]>;
    getOperationalFacts(
        tenantId: string,
        routeId: string,
    ): Promise<readonly ReconciledManifestMember[]>;
    getRouteStopStates(
        tenantId: string,
        routeId: string,
    ): Promise<readonly { readonly stopId: string; readonly state: string }[]>;
    getActiveCargoAssignmentCount(
        tenantId: string,
        routeId: string,
    ): Promise<number>;
    confirmDepotReceipt(
        tenantId: string,
        depotId: string,
        assignmentIds: readonly string[],
        actorUserId: string,
        receivedAt: Date,
    ): Promise<void>;
    recoverUnattendedPackages(
        tenantId: string,
        packageIds: readonly string[],
        reasonCode: string,
        actorUserId: string,
        recoveredAt: Date,
    ): Promise<void>;
    endCargoAssignments(
        tenantId: string,
        assignmentIds: readonly string[],
        reasonCode: string,
        endedAt: Date,
    ): Promise<void>;
    saveClosure(
        tenantId: string,
        summary: RouteClosureSummary,
        requestHash: string,
        requestId: string,
    ): Promise<void>;
    saveRoute(route: Route): Promise<void>;
    recordOutboxEvents(
        tenantId: string,
        events: readonly RouteDomainEvent[],
    ): Promise<void>;
    recordAuditLog(entry: RouteClosureAuditEntry): Promise<void>;
}

export interface RouteCloseUnitOfWork {
    execute<T>(
        tenantId: string,
        operation: (session: RouteCloseSession) => Promise<T>,
    ): Promise<T>;
}