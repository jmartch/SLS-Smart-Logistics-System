import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import {
  requireTenantContext,
  type TenantContext,
} from '../../../shared/application/tenant-context';
import {
  getCurrentActor,
  type RequestWithActor,
} from './current-actor.decorator';

// NotATenantActorError (platform admin on a tenant-only route) propagates on
// purpose; the global exception filter maps it to a 403.
export function getCurrentTenant(request: RequestWithActor): TenantContext {
  return requireTenantContext(getCurrentActor(request));
}

export const CurrentTenant = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): TenantContext =>
    getCurrentTenant(ctx.switchToHttp().getRequest<RequestWithActor>()),
);
