export interface RouteSummaryReaderPort {
    findSummaryByRouteId(
        tenantId: string,
        routeId: string,
    ): Promise<Record<string, unknown> | null>;
}