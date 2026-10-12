import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  getCurrentActor,
  type RequestWithActor,
} from '../../../shared/presentation/request-context.decorator';
import {
  AUTHENTICATED_ONLY_KEY,
  REQUIRED_PERMISSION_KEY,
} from './require-permission.decorator';

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({
    error: {
      code: 'PERMISSION_DENIED',
      message: 'No tienes permiso para realizar esta operacion.',
      fields: null,
    },
  });
}

// Runs after AuthGuard, so authorization is decided before the
// ValidationPipe sees the body or params: an unauthorized caller gets 403
// and learns nothing about the endpoint's input contract.
//
// Fails closed. A route must declare either @RequirePermission (the tenant
// permission it needs; handler-level overrides class-level) or
// @AuthenticatedOnly (any resolved actor passes; tenant-only routes still
// reject platform admins through CurrentTenant). A route that declares
// neither is denied with 403, so forgetting the decorator never opens an
// endpoint. A declared permission always wins over @AuthenticatedOnly. A
// missing actor (AuthGuard not applied) fails closed with 401.
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const actor = getCurrentActor(
      context.switchToHttp().getRequest<RequestWithActor>(),
    );
    const targets = [context.getHandler(), context.getClass()];
    const required = this.reflector.getAllAndOverride<string | undefined>(
      REQUIRED_PERMISSION_KEY,
      targets,
    );

    if (required === undefined) {
      const authenticatedOnly = this.reflector.getAllAndOverride<
        boolean | undefined
      >(AUTHENTICATED_ONLY_KEY, targets);

      if (authenticatedOnly === true) {
        return true;
      }

      throw permissionDenied();
    }

    // Tenant permissions never apply to platform admins: they have no tenant.
    if (actor.kind !== 'TENANT_USER' || !actor.permissions.has(required)) {
      throw permissionDenied();
    }

    return true;
  }
}
