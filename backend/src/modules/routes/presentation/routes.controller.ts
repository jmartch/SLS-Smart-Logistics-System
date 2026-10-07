import {
	Body,
	Controller,
	Get,
	Headers,
	HttpCode,
	HttpStatus,
	Param,
	Post,
	Query,
} from '@nestjs/common';
import {
	CurrentContext,
	type RequestContext,
} from '../../../shared/presentation/request-context.decorator';
import { ListRoutesUseCase } from '../application/use-cases/list-routes.use-case';
import { GetRouteDetailUseCase } from '../application/use-cases/get-route-detail.use-case';
import { PrepareRouteUseCase } from '../application/use-cases/prepare-route.use-case';
import { StartRouteUseCase } from '../application/use-cases/start-route.use-case';
import { CancelRouteUseCase } from '../application/use-cases/cancel-route.use-case';
import { InterruptRouteUseCase } from '../application/use-cases/interrupt-route.use-case';
import { CloseRouteUseCase } from '../application/use-cases/close-route.use-case';
import {
	GetRouteSummaryUseCase,
	type RouteSummaryResult,
} from '../application/use-cases/get-route-summary.use-case';
import {
	type PaginatedRoutesResult,
	type RouteDetailResult,
	type RouteOperationResult,
} from '../application/ports/route-contracts';
import { type CloseRouteResult } from '../application/ports/route-close-contracts';
import { validateRouteId } from './dto/route-id.dto';
import { validateAndBuildListQuery } from './dto/list-routes.dto';
import { validatePrepareRouteBody } from './dto/prepare-route.dto';
import { validateStartRouteBody } from './dto/start-route.dto';
import { validateCancelRouteBody } from './dto/cancel-route.dto';
import { validateInterruptRouteBody } from './dto/interrupt-route.dto';
import {
	validateCloseRouteBody,
	validateIdempotencyKey,
} from './dto/close-route.dto';
import { handleRoutesDomainError } from './routes-http-errors';

@Controller('routes')
export class RoutesController {
	constructor(
		private readonly listRoutesUseCase: ListRoutesUseCase,
		private readonly getRouteDetailUseCase: GetRouteDetailUseCase,
		private readonly prepareRouteUseCase: PrepareRouteUseCase,
		private readonly startRouteUseCase: StartRouteUseCase,
		private readonly cancelRouteUseCase: CancelRouteUseCase,
		private readonly interruptRouteUseCase: InterruptRouteUseCase,
		private readonly closeRouteUseCase: CloseRouteUseCase,
		private readonly getRouteSummaryUseCase: GetRouteSummaryUseCase,
	) { }

	@Get()
	async listRoutes(
		@CurrentContext() context: RequestContext,
		@Query() query: Record<string, unknown>,
	): Promise<PaginatedRoutesResult> {
		try {
			const validatedQuery = validateAndBuildListQuery(
				context.tenantId,
				context.actorUserId,
				context.correlationId,
				query,
			);
			return await this.listRoutesUseCase.execute(validatedQuery);
		} catch (error) {
			return handleRoutesDomainError(error);
		}
	}

	@Get(':id')
	async getRouteDetail(
		@CurrentContext() context: RequestContext,
		@Param('id') id: string,
	): Promise<RouteDetailResult> {
		try {
			const routeId = validateRouteId(id);
			return await this.getRouteDetailUseCase.execute({
				tenantId: context.tenantId,
				actorUserId: context.actorUserId,
				correlationId: context.correlationId,
				routeId,
			});
		} catch (error) {
			return handleRoutesDomainError(error);
		}
	}

	@Post(':id/prepare')
	@HttpCode(HttpStatus.OK)
	async prepareRoute(
		@CurrentContext() context: RequestContext,
		@Param('id') id: string,
		@Body() body: unknown,
	): Promise<RouteOperationResult> {
		try {
			const routeId = validateRouteId(id);
			const validated = validatePrepareRouteBody(body);
			return await this.prepareRouteUseCase.execute({
				tenantId: context.tenantId,
				actorUserId: context.actorUserId,
				correlationId: context.correlationId,
				routeId,
				depotConfirmed: validated.depotConfirmed,
			});
		} catch (error) {
			return handleRoutesDomainError(error);
		}
	}

	@Post(':id/start')
	@HttpCode(HttpStatus.OK)
	async startRoute(
		@CurrentContext() context: RequestContext,
		@Param('id') id: string,
		@Body() body?: unknown,
	): Promise<RouteOperationResult> {
		try {
			const routeId = validateRouteId(id);
			validateStartRouteBody(body);
			return await this.startRouteUseCase.execute({
				tenantId: context.tenantId,
				actorUserId: context.actorUserId,
				correlationId: context.correlationId,
				routeId,
			});
		} catch (error) {
			return handleRoutesDomainError(error);
		}
	}

	@Post(':id/cancel')
	@HttpCode(HttpStatus.OK)
	async cancelRoute(
		@CurrentContext() context: RequestContext,
		@Param('id') id: string,
		@Body() body: unknown,
	): Promise<RouteOperationResult> {
		try {
			const routeId = validateRouteId(id);
			const validated = validateCancelRouteBody(body);
			return await this.cancelRouteUseCase.execute({
				tenantId: context.tenantId,
				actorUserId: context.actorUserId,
				correlationId: context.correlationId,
				routeId,
				reasonCode: validated.reasonCode,
				reason: validated.reason,
			});
		} catch (error) {
			return handleRoutesDomainError(error);
		}
	}

	@Post(':id/interrupt')
	@HttpCode(HttpStatus.OK)
	async interruptRoute(
		@CurrentContext() context: RequestContext,
		@Param('id') id: string,
		@Body() body: unknown,
	): Promise<RouteOperationResult> {
		try {
			const routeId = validateRouteId(id);
			const validated = validateInterruptRouteBody(body);
			return await this.interruptRouteUseCase.execute({
				tenantId: context.tenantId,
				actorUserId: context.actorUserId,
				correlationId: context.correlationId,
				routeId,
				reasonCode: validated.reasonCode,
				reason: validated.reason,
			});
		} catch (error) {
			return handleRoutesDomainError(error);
		}
	}

	@Post(':id/close')
	@HttpCode(HttpStatus.OK)
	async closeRoute(
		@CurrentContext() context: RequestContext,
		@Headers() headers: Record<string, string | undefined>,
		@Param('id') id: string,
		@Body() body: unknown,
	): Promise<CloseRouteResult> {
		try {
			const routeId = validateRouteId(id);
			const requestId = validateIdempotencyKey(headers);
			const validated = validateCloseRouteBody(body);

			return await this.closeRouteUseCase.execute({
				tenantId: context.tenantId,
				actorUserId: context.actorUserId,
				correlationId: context.correlationId,
				routeId,
				requestId,
				mode: validated.mode,
				reasonCode: validated.reasonCode,
				notes: validated.notes,
				actualDistanceM: validated.actualDistanceM,
				depotReceipt: validated.depotReceipt,
			});
		} catch (error) {
			return handleRoutesDomainError(error);
		}
	}

	@Get(':id/summary')
	async getRouteSummary(
		@CurrentContext() context: RequestContext,
		@Param('id') id: string,
	): Promise<RouteSummaryResult> {
		try {
			const routeId = validateRouteId(id);
			return await this.getRouteSummaryUseCase.execute({
				tenantId: context.tenantId,
				actorUserId: context.actorUserId,
				correlationId: context.correlationId,
				routeId,
			});
		} catch (error) {
			return handleRoutesDomainError(error);
		}
	}
}
