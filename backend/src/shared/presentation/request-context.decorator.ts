import {
    createParamDecorator,
    ExecutionContext,
    UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { isValidTenantId } from '../../database/run-with-tenant';

export interface RequestContext {
    readonly tenantId: string;
    readonly actorUserId: string;
    readonly correlationId: string;
}

export function extractRequestContext(request: any): RequestContext {
    const tenantId =
        request?.user?.tenantId ??
        request?.headers?.['x-tenant-id'] ??
        request?.headers?.['tenant-id'];

    if (!tenantId || typeof tenantId !== 'string' || !isValidTenantId(tenantId)) {
        throw new UnauthorizedException({
            code: 'UNAUTHENTICATED',
            message: 'Sesión o contexto de empresa ausente o inválido.',
        });
    }

    const actorUserId =
        request?.user?.userId ??
        request?.user?.id ??
        request?.headers?.['x-user-id'] ??
        'system-coordinator';

    const correlationId =
        request?.headers?.['x-correlation-id'] ??
        request?.headers?.['correlation-id'] ??
        randomUUID();

    return {
        tenantId,
        actorUserId: String(actorUserId),
        correlationId: String(correlationId),
    };
}

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