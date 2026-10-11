import { RouteClosureMode } from '../../domain/route-closure.types';

export interface RouteAccessPort {
	canPrepareRoute(tenantId: string, actorUserId: string): Promise<boolean>;
	canStartRoute(
		tenantId: string,
		actorUserId: string,
		routeCourierId: string,
	): Promise<boolean>;
	canCancelRoute(tenantId: string, actorUserId: string): Promise<boolean>;
	canInterruptRoute(
		tenantId: string,
		actorUserId: string,
		routeCourierId: string,
	): Promise<boolean>;
	canViewRoute(
		tenantId: string,
		actorUserId: string,
		routeCourierId: string,
	): Promise<boolean>;
	getCourierIdForUser(tenantId: string, userId: string): Promise<string | null>;
	canCloseRoute(
		tenantId: string,
		actorUserId: string,
		mode: RouteClosureMode,
	): Promise<boolean>;
	canReceiveDepotCargo(
		tenantId: string,
		actorUserId: string,
	): Promise<boolean>;
	canViewRouteSummary(
		tenantId: string,
		actorUserId: string,
		routeCourierId: string,
	): Promise<boolean>;
}