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
} from './current-actor.decorator';
import { REQUIRED_PERMISSION_KEY } from './require-permission.decorator';

// Runs after AuthGuard, so authorization is decided before the
// ValidationPipe sees the body or params: an unauthorized caller gets 403
// and learns nothing about the endpoint's input contract.
//
// A route without @RequirePermission is only "authenticated": any resolved
// actor passes, and tenant-only routes still reject platform admins through
// CurrentTenant. A missing actor (AuthGuard not applied) fails closed with 401.
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const actor = getCurrentActor(
      context.switchToHttp().getRequest<RequestWithActor>(),
    );
    const required = this.reflector.getAllAndOverride<string | undefined>(
      REQUIRED_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (required === undefined) {
      return true;
    }

    // Tenant permissions never apply to platform admins: they have no tenant.
    if (actor.kind !== 'TENANT_USER' || !actor.permissions.has(required)) {
      throw new ForbiddenException({
        error: {
          code: 'PERMISSION_DENIED',
          message: 'No tienes permiso para realizar esta operacion.',
          fields: null,
        },
      });
    }

    return true;
  }
}
