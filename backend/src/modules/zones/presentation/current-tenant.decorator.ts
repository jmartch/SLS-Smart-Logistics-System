import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { isValidTenantId } from '../../../database/run-with-tenant';

export function extractTenantId(request: any): string {
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

  return tenantId;
}

export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    return extractTenantId(ctx.switchToHttp().getRequest());
  },
);
