import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  getCurrentActor,
  type RequestWithActor,
} from '../../../shared/presentation/request-context.decorator';

// Runs after AuthGuard. Rejecting tenant users here (instead of inside the
// handler) keeps authorization ahead of body validation, so a tenant user
// never learns anything about the platform endpoints' input contract.
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const actor = getCurrentActor(
      context.switchToHttp().getRequest<RequestWithActor>(),
    );

    if (actor.kind !== 'PLATFORM_ADMIN') {
      throw new ForbiddenException({
        error: {
          code: 'PERMISSION_DENIED',
          message: 'Solo la plataforma puede realizar esta operacion.',
          fields: null,
        },
      });
    }

    return true;
  }
}
