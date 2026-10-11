import {
    createParamDecorator,
    ExecutionContext,
    UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { isValidTenantId } from '../../database/run-with-tenant';
import type { ActorContext } from '../application/actor-context';
import {
    requireTenantContext,
    type TenantContext,
} from '../application/tenant-context';

export interface RequestWithActor {
    actor?: ActorContext;
}

export interface RequestContext {
    readonly tenantId: string;
    readonly actorUserId: string;
    readonly correlationId: string;
    readonly userId?: string;
    readonly permissions?: ReadonlySet<string>;
}

// A missing actor means the route was reached without AuthGuard. Failing
// closed with 401 is safer than handing controllers `undefined`.
export function getCurrentActor(request: RequestWithActor): ActorContext {
    if (!request?.actor) {
        throw new UnauthorizedException({
            error: {
                code: 'SESSION_EXPIRED',
                message: 'No hay sesion activa.',
                fields: null,
            },
        });
    }

    return request.actor;
}

// NotATenantActorError (platform admin on a tenant-only route) propagates on
// purpose; the global exception filter maps it to a 403.
export function getCurrentTenant(request: RequestWithActor): TenantContext {
    return requireTenantContext(getCurrentActor(request));
}

export function extractRequestContext(request: any): RequestContext {
    const rawCorrelationId =
        request?.headers?.['x-correlation-id'] ??
        request?.headers?.['correlation-id'];
    const correlationId =
        typeof rawCorrelationId === 'string' && rawCorrelationId.trim().length > 0
            ? rawCorrelationId.trim()
            : randomUUID();

    if (request?.actor) {
        const tenantContext = getCurrentTenant(request as RequestWithActor);
        const normalizedActorTenantId = tenantContext.tenantId.trim();
        if (!isValidTenantId(normalizedActorTenantId)) {
            throw new UnauthorizedException({
                code: 'UNAUTHENTICATED',
                message: 'Missing or invalid tenant context',
                field: 'tenantId',
            });
        }

        const normalizedUserId = tenantContext.userId.trim();
        return {
            tenantId: normalizedActorTenantId,
            userId: normalizedUserId,
            actorUserId: normalizedUserId,
            correlationId,
            permissions: tenantContext.permissions,
        };
    }

    const rawTenantId =
        request?.user?.tenantId ??
        request?.headers?.['x-tenant-id'] ??
        request?.headers?.['tenant-id'];
    const tenantId =
        typeof rawTenantId === 'string' ? rawTenantId.trim() : '';

    if (!tenantId || !isValidTenantId(tenantId)) {
        throw new UnauthorizedException({
            code: 'UNAUTHENTICATED',
            message: 'Missing or invalid tenant context',
            field: 'tenantId',
        });
    }

    const rawActorUserId =
        request?.user?.userId ??
        request?.user?.id ??
        request?.headers?.['x-user-id'];
    const actorUserId =
        typeof rawActorUserId === 'string' && rawActorUserId.trim().length > 0
            ? rawActorUserId.trim()
            : 'system-coordinator';

    return {
        tenantId,
        userId: actorUserId,
        actorUserId,
        correlationId,
    };
}

export function extractTenantId(request: any): string {
    return extractRequestContext(request).tenantId;
}

export const CurrentActor = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext): ActorContext => {
        return getCurrentActor(
            ctx.switchToHttp().getRequest<RequestWithActor>(),
        );
    },
);

export const CurrentTenantContext = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext): TenantContext => {
        return getCurrentTenant(
            ctx.switchToHttp().getRequest<RequestWithActor>(),
        );
    },
);

export const CurrentContext = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext): RequestContext => {
        return extractRequestContext(ctx.switchToHttp().getRequest());
    },
);

export const CurrentTenant = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext): string => {
        return extractRequestContext(ctx.switchToHttp().getRequest()).tenantId;
    },
);

export const CurrentUser = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext): string => {
        return extractRequestContext(ctx.switchToHttp().getRequest()).actorUserId;
    },
);