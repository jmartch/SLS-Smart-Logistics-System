import { RouteState } from '../../domain/route-state';
import {
    RouteNotFoundError,
    RouteForbiddenError,
    RouteNotCompletedError,
} from '../../domain/route-errors';
import { RouteRepository } from '../../domain/route.repository';
import { RouteAccessPort } from '../ports/route-access.port';
import { RouteSummaryReaderPort } from '../ports/route-summary-reader.port';

export interface GetRouteSummaryQuery {
    readonly tenantId: string;
    readonly routeId: string;
    readonly actorUserId: string;
    readonly correlationId?: string;
}

export type RouteSummaryResult = Record<string, unknown>;

export class GetRouteSummaryUseCase {
    constructor(
        private readonly routeRepository: RouteRepository,
        private readonly summaryReader: RouteSummaryReaderPort,
        private readonly accessPort: RouteAccessPort,
    ) { }

    async execute(query: GetRouteSummaryQuery): Promise<Record<string, unknown>> {
        // 1. Verificar existencia de la ruta en el tenant
        const route = await this.routeRepository.findById(
            query.tenantId,
            query.routeId,
        );
        if (!route) {
            throw new RouteNotFoundError(query.routeId);
        }

        // 2. Comprobar que la ruta esté en estado COMPLETED (409 si sigue abierta)
        if (route.state !== RouteState.COMPLETED) {
            throw new RouteNotCompletedError(query.routeId);
        }

        // 3. Comprobar autorización de lectura
        const canView = await this.accessPort.canViewRouteSummary(
            query.tenantId,
            query.actorUserId,
            route.courierId,
        );
        if (!canView) {
            throw new RouteForbiddenError(
                'Actor is not authorized to view this route summary',
            );
        }

        // 4. Obtener el snapshot inmutable persistido
        const snapshot = await this.summaryReader.findSummaryByRouteId(
            query.tenantId,
            query.routeId,
        );
        if (!snapshot) {
            throw new RouteNotCompletedError(query.routeId);
        }

        // 5. Proyección por rol: redactar notas internas para el courier asignado
        const courierId = await this.accessPort.getCourierIdForUser(
            query.tenantId,
            query.actorUserId,
        );
        const isAssignedCourier = courierId === route.courierId;

        if (isAssignedCourier) {
            const { notes, reasonCode, ...courierProjection } = snapshot;
            return Object.freeze(courierProjection);
        }

        return Object.freeze(snapshot);
    }
}