import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { ActorContext } from '../../../shared/application/actor-context';

export interface RequestWithActor {
  actor?: ActorContext;
}

// A missing actor means the route was reached without AuthGuard. Failing
// closed with 401 is safer than handing controllers `undefined`.
export function getCurrentActor(request: RequestWithActor): ActorContext {
  if (!request.actor) {
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

export const CurrentActor = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): ActorContext =>
    getCurrentActor(ctx.switchToHttp().getRequest<RequestWithActor>()),
);
